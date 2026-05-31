const bcrypt = require('bcryptjs');

const { app } = require('../app');
const { env } = require('../config/env');
const { consultar, probarConexion, pool } = require('../config/database');

const checks = [];

function ok(nombre, detalle = '') {
  checks.push({ estado: 'OK', nombre, detalle });
}

function warn(nombre, detalle = '') {
  checks.push({ estado: 'WARN', nombre, detalle });
}

function fail(nombre, detalle = '') {
  checks.push({ estado: 'ERROR', nombre, detalle });
}

function listarRutasExpress() {
  const rutas = [];

  for (const layer of app._router?.stack || []) {
    if (layer.route?.path) {
      rutas.push(layer.route.path);
      continue;
    }

    if (layer.name === 'router' && layer.regexp) {
      rutas.push(String(layer.regexp));
    }
  }

  return rutas;
}

async function tablaExiste(nombre) {
  const filas = await consultar(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = :database
        AND table_name = :tabla`,
    { database: env.db.database, tabla: nombre }
  );

  return Number(filas[0]?.total || 0) > 0;
}

async function verificarTablas() {
  const tablas = [
    'roles',
    'usuarios',
    'areas',
    'cargos',
    'trabajadores',
    'turnos',
    'asignaciones_turno',
    'registros_asistencia',
    'tokens_qr',
    'tipos_solicitud',
    'solicitudes_trabajador',
    'aprobaciones_solicitud',
    'horas_extra',
    'configuraciones',
    'auditoria'
  ];

  const faltantes = [];
  for (const tabla of tablas) {
    if (!(await tablaExiste(tabla))) faltantes.push(tabla);
  }

  if (faltantes.length) {
    fail('Tablas principales', `Faltan: ${faltantes.join(', ')}`);
    return;
  }

  ok('Tablas principales', `${tablas.length} tablas encontradas`);
}

async function verificarSeedBase() {
  const [roles] = await consultar('SELECT COUNT(*) AS total FROM roles');
  const [tipos] = await consultar('SELECT COUNT(*) AS total FROM tipos_solicitud');
  const [turnos] = await consultar('SELECT COUNT(*) AS total FROM turnos');

  Number(roles.total) >= 4
    ? ok('Roles base', `${roles.total} roles`)
    : fail('Roles base', 'Se esperaban al menos admin, supervisor, vigilante y trabajador');

  Number(tipos.total) >= 3
    ? ok('Tipos de solicitud', `${tipos.total} tipos`)
    : fail('Tipos de solicitud', 'Faltan justificacion/horas extra u otros tipos base');

  Number(turnos.total) >= 1
    ? ok('Turnos base', `${turnos.total} turnos`)
    : warn('Turnos base', 'No hay turnos registrados para probar asignaciones');
}

async function verificarAdmin() {
  const filas = await consultar(
    `SELECT u.usuario, u.contrasena_hash, u.estado, r.codigo AS rol
       FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.usuario = 'admin'
      LIMIT 1`
  );

  const admin = filas[0];
  if (!admin) {
    fail('Usuario admin', 'No existe el usuario admin');
    return;
  }

  if (admin.estado !== 'activo') {
    fail('Usuario admin', 'Existe, pero esta inactivo');
    return;
  }

  if (admin.rol !== 'admin') {
    fail('Usuario admin', `Tiene rol ${admin.rol}, se esperaba admin`);
    return;
  }

  const claveCorrecta = await bcrypt.compare('admin123', admin.contrasena_hash);
  claveCorrecta
    ? ok('Credencial admin', 'admin / admin123 valida')
    : fail('Credencial admin', 'La contrasena admin123 no coincide con el hash guardado');
}

async function verificarConfiguracion() {
  const claves = [
    'nombre_empresa',
    'logo_empresa_url',
    'eslogan_empresa',
    'zona_horaria',
    'reconocimiento_facial_activo',
    'confianza_facial_minima',
    'umbral_minutos_tardanza_alerta',
    'tolerancia_global_minutos'
  ];

  const filas = await consultar(
    `SELECT clave
       FROM configuraciones
      WHERE clave IN (${claves.map((_, index) => `:clave${index}`).join(', ')})`,
    Object.fromEntries(claves.map((clave, index) => [`clave${index}`, clave]))
  );

  const presentes = new Set(filas.map((fila) => fila.clave));
  const faltantes = claves.filter((clave) => !presentes.has(clave));

  faltantes.length
    ? warn('Configuracion base', `Faltan claves: ${faltantes.join(', ')}`)
    : ok('Configuracion base', `${claves.length} claves encontradas`);
}

async function verificarMigraciones() {
  if (!(await tablaExiste('schema_migrations'))) {
    warn('Migraciones', 'No existe schema_migrations; ejecuta npm run migrate');
    return;
  }

  const filas = await consultar('SELECT id_migracion FROM schema_migrations ORDER BY id_migracion');
  filas.length
    ? ok('Migraciones', `${filas.length} migracion(es) aplicada(s): ${filas.map((fila) => fila.id_migracion).join(', ')}`)
    : warn('Migraciones', 'La tabla existe, pero no hay migraciones aplicadas');
}

function verificarRutas() {
  const rutas = listarRutasExpress().join('\n');
  const modulos = [
    '/api/auth',
    '/api/usuarios',
    '/api/trabajadores',
    '/api/turnos',
    '/api/asistencias',
    '/api/qr',
    '/api/solicitudes',
    '/api/configuracion',
    '/api/reportes',
    '/api/auditoria',
    '/api/facial'
  ];

  const faltantes = modulos.filter((modulo) => !rutas.includes(modulo.replace(/\//g, '\\/')));

  faltantes.length
    ? fail('Rutas API', `No se detectaron: ${faltantes.join(', ')}`)
    : ok('Rutas API', `${modulos.length} modulos montados`);
}

async function main() {
  console.log('Verificando sistema de asistencia...\n');

  try {
    await probarConexion();
    ok('Conexion MySQL', `${env.db.host}:${env.db.port}/${env.db.database}`);
  } catch (error) {
    fail('Conexion MySQL', error.message);
  }

  if (!checks.some((check) => check.estado === 'ERROR' && check.nombre === 'Conexion MySQL')) {
    await verificarTablas();
    await verificarSeedBase();
    await verificarAdmin();
    await verificarConfiguracion();
    await verificarMigraciones();
  }

  verificarRutas();

  for (const check of checks) {
    const detalle = check.detalle ? ` - ${check.detalle}` : '';
    console.log(`[${check.estado}] ${check.nombre}${detalle}`);
  }

  const errores = checks.filter((check) => check.estado === 'ERROR').length;
  const advertencias = checks.filter((check) => check.estado === 'WARN').length;

  console.log(`\nResultado: ${errores} error(es), ${advertencias} advertencia(s).`);
  process.exitCode = errores ? 1 : 0;
}

main()
  .catch((error) => {
    console.error('[ERROR] Verificacion interrumpida:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

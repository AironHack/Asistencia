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

async function contar(sql, parametros = {}) {
  const [fila] = await consultar(sql, parametros);
  return Number(fila?.total || 0);
}

async function valorConfig(clave) {
  const [fila] = await consultar(
    'SELECT JSON_UNQUOTE(valor) AS valor FROM configuraciones WHERE clave = :clave LIMIT 1',
    { clave }
  );
  return fila?.valor ?? null;
}

async function verificarUsuariosPorRol() {
  const filas = await consultar(
    `SELECT r.codigo AS rol, COUNT(*) AS total
       FROM usuarios u
       INNER JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.estado = 'activo'
      GROUP BY r.codigo`
  );

  const porRol = Object.fromEntries(filas.map((fila) => [fila.rol, Number(fila.total)]));

  porRol.admin
    ? ok('Usuario admin activo', `${porRol.admin} cuenta(s)`)
    : fail('Usuario admin activo', 'Necesitas al menos una cuenta admin');

  porRol.vigilante
    ? ok('Usuario vigilante activo', `${porRol.vigilante} cuenta(s)`)
    : warn('Usuario vigilante activo', 'Crea una cuenta vigilante para probar Registro sin usar admin');

  porRol.trabajador
    ? ok('Usuario trabajador activo', `${porRol.trabajador} cuenta(s)`)
    : warn('Usuario trabajador activo', 'Crea acceso web para al menos un trabajador');

  porRol.supervisor
    ? ok('Usuario supervisor activo', `${porRol.supervisor} cuenta(s)`)
    : warn('Usuario supervisor activo', 'Opcional: crea supervisor para probar reportes por area');
}

async function verificarPersonal() {
  const trabajadoresActivos = await contar(
    `SELECT COUNT(*) AS total
       FROM trabajadores
      WHERE activo = true
        AND eliminado_en IS NULL`
  );

  trabajadoresActivos
    ? ok('Trabajadores activos', `${trabajadoresActivos} trabajador(es)`)
    : fail('Trabajadores activos', 'Registra al menos un trabajador activo');

  const trabajadoresConUsuario = await contar(
    `SELECT COUNT(*) AS total
       FROM trabajadores t
       INNER JOIN usuarios u ON u.id_usuario = t.id_usuario
      WHERE t.activo = true
        AND t.eliminado_en IS NULL
        AND u.estado = 'activo'`
  );

  trabajadoresConUsuario
    ? ok('Portal trabajador', `${trabajadoresConUsuario} trabajador(es) con acceso web`)
    : warn('Portal trabajador', 'Crea usuario y contrasena para un trabajador');

  const conTurno = await contar(
    `SELECT COUNT(*) AS total
       FROM trabajadores
      WHERE activo = true
        AND eliminado_en IS NULL
        AND id_turno_actual IS NOT NULL`
  );

  conTurno
    ? ok('Turnos asignados', `${conTurno} trabajador(es) con turno actual`)
    : warn('Turnos asignados', 'Asigna turno para calcular puntualidad/tardanza');
}

async function verificarFotosYRostros() {
  const fotosPrincipales = await contar(
    `SELECT COUNT(*) AS total
       FROM fotos_trabajador
      WHERE es_principal = true`
  );

  fotosPrincipales
    ? ok('Fotos principales', `${fotosPrincipales} foto(s) principal(es)`)
    : warn('Fotos principales', 'Captura rostro desde Personal > Rostro para generar foto principal');

  const plantillasActivas = await contar(
    `SELECT COUNT(*) AS total
       FROM plantillas_faciales
      WHERE activo = true`
  );

  plantillasActivas
    ? ok('Plantillas faciales activas', `${plantillasActivas} plantilla(s)`)
    : warn('Plantillas faciales activas', 'Captura rostro base para probar QR + rostro');

  const plantillasV2 = await contar(
    `SELECT COUNT(*) AS total
       FROM plantillas_faciales
      WHERE activo = true
        AND modelo = 'visual-hash-v2'`
  );

  plantillasV2
    ? ok('Modelo facial actual', `${plantillasV2} plantilla(s) visual-hash-v2`)
    : warn('Modelo facial actual', 'Recaptura rostros antiguos para usar visual-hash-v2');
}

async function verificarQrSeguro() {
  const requiereFacial = String(await valorConfig('qr_fotocheck_requiere_facial') ?? 'true').toLowerCase();
  ['true', '1', 'si', 'yes'].includes(requiereFacial)
    ? ok('QR con rostro obligatorio', 'qr_fotocheck_requiere_facial activo')
    : warn('QR con rostro obligatorio', 'Activalo en Configuracion para evitar uso de capturas');

  const tokensActivos = await contar(
    `SELECT COUNT(*) AS total
       FROM tokens_qr
      WHERE estado = 'activo'`
  );

  tokensActivos
    ? ok('QR generados', `${tokensActivos} token(es) activo(s)`)
    : warn('QR generados', 'Genera un fotocheck desde Personal > QR o desde Mi portal');
}

async function verificarSolicitudesYReportes() {
  const tipos = await contar('SELECT COUNT(*) AS total FROM tipos_solicitud');
  tipos
    ? ok('Tipos de solicitud', `${tipos} tipo(s)`)
    : warn('Tipos de solicitud', 'Importa seed.sql para cargar tipos base');

  const asistencias = await contar('SELECT COUNT(*) AS total FROM registros_asistencia');
  asistencias
    ? ok('Reportes con datos', `${asistencias} asistencia(s) registrada(s)`)
    : warn('Reportes con datos', 'Registra una entrada/salida para probar reportes');
}

async function main() {
  console.log('Verificacion final del flujo operativo...\n');

  try {
    await probarConexion();
    ok('Conexion MySQL', `${env.db.host}:${env.db.port}/${env.db.database}`);
  } catch (error) {
    fail('Conexion MySQL', error.message);
  }

  if (!checks.some((check) => check.estado === 'ERROR' && check.nombre === 'Conexion MySQL')) {
    await verificarUsuariosPorRol();
    await verificarPersonal();
    await verificarFotosYRostros();
    await verificarQrSeguro();
    await verificarSolicitudesYReportes();
  }

  for (const check of checks) {
    const detalle = check.detalle ? ` - ${check.detalle}` : '';
    console.log(`[${check.estado}] ${check.nombre}${detalle}`);
  }

  const errores = checks.filter((check) => check.estado === 'ERROR').length;
  const advertencias = checks.filter((check) => check.estado === 'WARN').length;

  console.log(`\nResultado: ${errores} error(es), ${advertencias} advertencia(s).`);
  if (advertencias) {
    console.log('Las advertencias no bloquean el sistema, pero indican que falta completar datos para probar todo el flujo.');
  }

  process.exitCode = errores ? 1 : 0;
}

main()
  .catch((error) => {
    console.error('[ERROR] Verificacion final interrumpida:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

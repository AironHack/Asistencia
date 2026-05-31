const fs = require('fs');
const path = require('path');

const { env } = require('../config/env');
const { probarConexion, pool } = require('../config/database');

const resultados = [];

function ok(nombre, detalle = '') {
  resultados.push({ estado: 'OK', nombre, detalle });
}

function warn(nombre, detalle = '') {
  resultados.push({ estado: 'WARN', nombre, detalle });
}

function fail(nombre, detalle = '') {
  resultados.push({ estado: 'ERROR', nombre, detalle });
}

function secretoFuerte(nombre, valor) {
  const debiles = [
    'change_me',
    'tu_clave',
    'CAMBIA_',
    'secret',
    'password',
    '123'
  ];

  if (!valor || String(valor).length < 32) {
    fail(nombre, 'Debe tener al menos 32 caracteres');
    return;
  }

  if (debiles.some((texto) => String(valor).includes(texto))) {
    fail(nombre, 'Parece un valor de ejemplo; genera uno aleatorio');
    return;
  }

  ok(nombre, 'Secreto configurado');
}

function validarOrigenes() {
  const origenes = env.origenesFrontend;
  if (!origenes.length) {
    fail('FRONTEND_ORIGIN', 'Debe indicar el dominio real del frontend');
    return;
  }

  const locales = origenes.filter((origen) =>
    /^http:\/\/localhost/.test(origen)
    || /^http:\/\/127\.0\.0\.1/.test(origen)
    || /^http:\/\/192\.168\./.test(origen)
    || /^http:\/\/10\./.test(origen)
    || /^http:\/\/172\./.test(origen)
  );

  if (locales.length) {
    fail('FRONTEND_ORIGIN', `No uses origenes locales en produccion: ${locales.join(', ')}`);
    return;
  }

  const inseguros = origenes.filter((origen) => !origen.startsWith('https://'));
  if (inseguros.length) {
    warn('FRONTEND_ORIGIN', `Recomendado usar HTTPS: ${inseguros.join(', ')}`);
    return;
  }

  ok('FRONTEND_ORIGIN', origenes.join(', '));
}

function validarBuildWeb() {
  const dist = path.resolve(__dirname, '../../../web/dist/index.html');
  fs.existsSync(dist)
    ? ok('Build frontend', 'web/dist/index.html existe')
    : warn('Build frontend', 'Ejecuta npm run build dentro de web antes de publicar');
}

function validarEntorno() {
  env.entorno === 'production'
    ? ok('APP_ENV', 'production')
    : warn('APP_ENV', `Actual: ${env.entorno}. Para entrega final usa APP_ENV=production`);
}

async function main() {
  console.log('Chequeando preparacion de produccion...\n');

  validarEntorno();
  validarOrigenes();
  validarBuildWeb();
  secretoFuerte('JWT_ACCESS_SECRET', env.jwt.accessSecret);
  secretoFuerte('JWT_REFRESH_SECRET', env.jwt.refreshSecret);
  secretoFuerte('QR_HMAC_SECRET', env.qr.hmacSecret);

  if (env.db.user === 'root') {
    warn('DB_USERNAME', 'Para produccion conviene usar un usuario MySQL dedicado, no root');
  } else {
    ok('DB_USERNAME', env.db.user);
  }

  try {
    await probarConexion();
    ok('Conexion MySQL', `${env.db.host}:${env.db.port}/${env.db.database}`);
  } catch (error) {
    fail('Conexion MySQL', error.message);
  }

  for (const item of resultados) {
    const detalle = item.detalle ? ` - ${item.detalle}` : '';
    console.log(`[${item.estado}] ${item.nombre}${detalle}`);
  }

  const errores = resultados.filter((item) => item.estado === 'ERROR').length;
  const advertencias = resultados.filter((item) => item.estado === 'WARN').length;
  console.log(`\nResultado: ${errores} error(es), ${advertencias} advertencia(s).`);
  process.exitCode = errores ? 1 : 0;
}

main()
  .catch((error) => {
    console.error('[ERROR] Chequeo interrumpido:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

const { app } = require('./app');
const { env } = require('./config/env');
const { probarConexion } = require('./config/database');

async function iniciarServidor() {
  await probarConexion();

  app.listen(env.puerto, () => {
    console.log(`API de asistencia escuchando en http://localhost:${env.puerto}`);
  });
}

iniciarServidor().catch((error) => {
  console.error('No se pudo iniciar el backend:', error.message);
  process.exit(1);
});


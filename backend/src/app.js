const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { env } = require('./config/env');
const { errorHandler } = require('./shared/error-handler');

const authRoutes = require('./modules/auth/auth.routes');
const usuariosRoutes = require('./modules/users/users.routes');
const trabajadoresRoutes = require('./modules/employees/trabajadores.routes');
const turnosRoutes = require('./modules/schedules/turnos.routes');
const asistenciaRoutes = require('./modules/attendance/asistencia.routes');
const qrRoutes = require('./modules/qr/qr.routes');
const solicitudesRoutes = require('./modules/requests/solicitudes.routes');
const configuracionRoutes = require('./modules/settings/configuracion.routes');
const reportesRoutes = require('./modules/reports/reportes.routes');
const auditoriaRoutes = require('./modules/audit/auditoria.routes');
const facialRoutes = require('./modules/face/facial.routes');

const app = express();

function origenLocalDesarrolloPermitido(origin) {
  if (env.entorno === 'production') return false;

  try {
    const url = new URL(origin);
    const puertoPermitido = ['5173', '5174', '5180'].includes(url.port);
    const host = url.hostname;
    const hostPermitido = host === 'localhost'
      || host === '127.0.0.1'
      || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);

    return puertoPermitido && hostPermitido;
  } catch {
    return false;
  }
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.origenesFrontend.includes(origin) || origenLocalDesarrolloPermitido(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' })); 
app.use(morgan(env.entorno === 'production' ? 'combined' : 'dev'));

app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

app.get('/api/salud', (_req, res) => {
  res.json({ ok: true, servicio: 'asistencia-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/trabajadores', trabajadoresRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/asistencias', asistenciaRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/facial', facialRoutes);

app.use((_req, _res, next) => {
  next(Object.assign(new Error('Ruta no encontrada'), { status: 404 }));
});

app.use(errorHandler);

module.exports = { app };

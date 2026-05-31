require('dotenv').config();

const parseList = (value, fallback) =>
  String(value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const env = {
  entorno: process.env.APP_ENV || 'development',
  puerto: Number(process.env.APP_PORT || 3000),
  zonaHoraria: process.env.APP_TIMEZONE || 'America/Lima',
  origenFrontend: process.env.FRONTEND_ORIGIN || 'http://localhost:5180',
  origenesFrontend: parseList(process.env.FRONTEND_ORIGIN, 'http://localhost:5173,http://localhost:5180,http://127.0.0.1:5180'),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE || 'asistencia_db',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || ''
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh_secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },
  qr: {
    hmacSecret: process.env.QR_HMAC_SECRET || 'change_me_qr_hmac_secret',
    expiresSeconds: Number(process.env.QR_EXPIRES_SECONDS || 300)
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  login: {
    maxIntentos: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    ventanaMs: Number(process.env.LOGIN_WINDOW_MINUTES || 15) * 60 * 1000,
    bloqueoMs: Number(process.env.LOGIN_LOCK_MINUTES || 10) * 60 * 1000
  },
  facialActivo: String(process.env.FACE_RECOGNITION_ENABLED || 'true') === 'true',
  confianzaFacialMinima: Number(process.env.FACE_CONFIDENCE_MIN || 0.85)
};

module.exports = { env };

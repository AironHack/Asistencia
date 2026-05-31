const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { consultar } = require('../config/database');
const { httpError } = require('./http-error');

async function autenticar(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');

    if (tipo !== 'Bearer' || !token) {
      throw httpError(401, 'Token no enviado');
    }

    const payload = jwt.verify(token, env.jwt.accessSecret);
    const usuarios = await consultar(
      `SELECT u.id_usuario, u.nombre_completo, u.usuario, u.estado, r.codigo AS rol, u.id_area,
              t.id_trabajador
       FROM usuarios u
       INNER JOIN roles r ON r.id_rol = u.id_rol
       LEFT JOIN trabajadores t ON t.id_usuario = u.id_usuario AND t.eliminado_en IS NULL
       WHERE u.id_usuario = :id_usuario
       LIMIT 1`,
      { id_usuario: payload.id_usuario }
    );

    if (!usuarios.length || usuarios[0].estado !== 'activo') {
      throw httpError(401, 'Usuario inactivo o no encontrado');
    }

    req.usuario = usuarios[0];
    next();
  } catch (error) {
    next(error.status ? error : httpError(401, 'Token invalido'));
  }
}

module.exports = { autenticar };

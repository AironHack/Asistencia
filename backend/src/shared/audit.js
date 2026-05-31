const { consultar } = require('../config/database');

function obtenerIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

async function auditar(req, { accion, entidad, id_entidad, datos_anteriores = null, datos_nuevos = null }) {
  await consultar(
    `INSERT INTO auditoria
     (id_usuario, accion, entidad, id_entidad, datos_anteriores, datos_nuevos, ip)
     VALUES
     (:id_usuario, :accion, :entidad, :id_entidad, CAST(:datos_anteriores AS JSON), CAST(:datos_nuevos AS JSON), :ip)`,
    {
      id_usuario: req.usuario?.id_usuario || null,
      accion,
      entidad,
      id_entidad: id_entidad || null,
      datos_anteriores: datos_anteriores === null ? null : JSON.stringify(datos_anteriores),
      datos_nuevos: datos_nuevos === null ? null : JSON.stringify(datos_nuevos),
      ip: obtenerIp(req)
    }
  );
}

module.exports = { auditar };

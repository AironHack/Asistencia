const { Router } = require('express');

const { consultar } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');

const router = Router();

router.use(autenticar);

function normalizarJson(valor) {
  if (valor === null || valor === undefined) return null;
  if (Buffer.isBuffer(valor)) {
    return normalizarJson(valor.toString('utf8'));
  }
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

router.get('/', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const {
    entidad,
    accion,
    usuario,
    ip,
    fecha_inicio,
    fecha_fin
  } = req.query;

  const limitePedido = Number(req.query.limite || 100);
  const limite = Number.isFinite(limitePedido)
    ? Math.min(Math.max(Math.trunc(limitePedido), 1), 250)
    : 100;
  const filtros = [];
  const params = {};

  if (entidad) {
    filtros.push('a.entidad = :entidad');
    params.entidad = entidad;
  }

  if (accion) {
    filtros.push('a.accion LIKE :accion');
    params.accion = `%${accion}%`;
  }

  if (usuario) {
    filtros.push('(u.usuario LIKE :usuario OR u.nombre_completo LIKE :usuario)');
    params.usuario = `%${usuario}%`;
  }

  if (ip) {
    filtros.push('a.ip LIKE :ip');
    params.ip = `%${ip}%`;
  }

  if (fecha_inicio) {
    filtros.push('DATE(a.creado_en) >= :fecha_inicio');
    params.fecha_inicio = fecha_inicio;
  }

  if (fecha_fin) {
    filtros.push('DATE(a.creado_en) <= :fecha_fin');
    params.fecha_fin = fecha_fin;
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const auditoria = await consultar(
    `SELECT a.id_auditoria, a.id_usuario, u.usuario, u.nombre_completo AS usuario_nombre,
            a.accion, a.entidad, a.id_entidad, a.datos_anteriores, a.datos_nuevos,
            a.ip, a.creado_en
     FROM auditoria a
     LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
     ${where}
     ORDER BY a.creado_en DESC
     LIMIT ${limite}`,
    params
  );

  res.json({
    ok: true,
    auditoria: auditoria.map((item) => ({
      ...item,
      datos_anteriores: normalizarJson(item.datos_anteriores),
      datos_nuevos: normalizarJson(item.datos_nuevos)
    }))
  });
}));

module.exports = router;

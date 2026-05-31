const { Router } = require('express');

const { consultar } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { fechaMysql } = require('../attendance/asistencia.service');

const router = Router();

router.use(autenticar);

router.get('/asistencias-hoy', autorizarRoles('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const filtros = [];
  const params = { fecha_hoy: fechaMysql() };

  if (req.usuario.rol === 'supervisor') {
    filtros.push('id_trabajador IN (SELECT id_trabajador FROM trabajadores WHERE id_area = :id_area_usuario)');
    params.id_area_usuario = req.usuario.id_area;
  }

  filtros.push('t.activo = true');
  filtros.push('t.eliminado_en IS NULL');
  const where = `WHERE ${filtros.join(' AND ')}`;

  const filas = await consultar(
    `SELECT
       t.id_trabajador,
       t.nombre_completo,
       t.dni,
       a.nombre AS area,
       c.nombre AS cargo,
       tu.nombre AS turno,
       entrada.marcado_en AS hora_entrada,
       salida.marcado_en AS hora_salida,
       COALESCE(entrada.estado, 'ausente') AS estado,
       COALESCE(entrada.minutos_tardanza, 0) AS minutos_tardanza
     FROM trabajadores t
     INNER JOIN areas a ON a.id_area = t.id_area
     LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
     LEFT JOIN turnos tu ON tu.id_turno = t.id_turno_actual
     LEFT JOIN registros_asistencia entrada
       ON entrada.id_trabajador = t.id_trabajador
      AND entrada.fecha_asistencia = :fecha_hoy
      AND entrada.tipo_marcacion = 'entrada'
     LEFT JOIN registros_asistencia salida
       ON salida.id_trabajador = t.id_trabajador
      AND salida.fecha_asistencia = :fecha_hoy
      AND salida.tipo_marcacion = 'salida'
     ${where}
     ORDER BY area, nombre_completo`,
    params
  );

  res.json({
    ok: true,
    formato_disponible: ['json'],
    reporte: filas
  });
}));

router.get('/asistencias-rango', autorizarRoles('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const { fecha_inicio, fecha_fin, id_area, id_trabajador, estado } = req.query;
  const filtros = ['ra.fecha_asistencia BETWEEN :fecha_inicio AND :fecha_fin'];
  const params = {
    fecha_inicio: fecha_inicio || '1900-01-01',
    fecha_fin: fecha_fin || '2999-12-31'
  };

  if (req.usuario.rol === 'supervisor') {
    filtros.push('t.id_area = :id_area_usuario');
    params.id_area_usuario = req.usuario.id_area;
  }

  if (id_area && req.usuario.rol === 'admin') {
    filtros.push('t.id_area = :id_area');
    params.id_area = id_area;
  }

  if (id_trabajador) {
    filtros.push('t.id_trabajador = :id_trabajador');
    params.id_trabajador = id_trabajador;
  }

  if (estado) {
    filtros.push('ra.estado = :estado');
    params.estado = estado;
  }

  const reporte = await consultar(
    `SELECT ra.fecha_asistencia, ra.tipo_marcacion, ra.marcado_en, ra.origen, ra.estado,
            ra.minutos_tardanza, t.nombre_completo, t.dni, a.nombre AS area, c.nombre AS cargo
     FROM registros_asistencia ra
     INNER JOIN trabajadores t ON t.id_trabajador = ra.id_trabajador
     INNER JOIN areas a ON a.id_area = t.id_area
     LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
     WHERE ${filtros.join(' AND ')}
     ORDER BY ra.fecha_asistencia DESC, t.nombre_completo`,
    params
  );

  res.json({ ok: true, formato_disponible: ['json'], reporte });
}));

module.exports = router;

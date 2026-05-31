const { Router } = require('express');

const { consultar, transaccion } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');
const {
  requerido,
  limitarTexto,
  validarFecha,
  validarUrl,
  validarId,
  idOpcional,
  validarEnteroRango
} = require('../../shared/validators');

const router = Router();

router.use(autenticar);

router.get('/tipos', asyncHandler(async (_req, res) => {
  const tipos = await consultar('SELECT id_tipo_solicitud, codigo, nombre FROM tipos_solicitud ORDER BY nombre');
  res.json({ ok: true, tipos });
}));

router.get('/', autorizarRoles('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const filtros = [];
  const params = {};

  if (req.usuario.rol === 'supervisor') {
    filtros.push('t.id_area = :id_area_usuario');
    params.id_area_usuario = req.usuario.id_area;
  }

  if (req.query.estado) {
    if (!['pendiente', 'aprobada', 'rechazada'].includes(req.query.estado)) {
      throw httpError(400, 'Estado de solicitud no valido');
    }
    filtros.push('s.estado = :estado');
    params.estado = req.query.estado;
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const solicitudes = await consultar(
    `SELECT s.id_solicitud, s.fecha_solicitud, s.motivo, s.url_adjunto, s.estado,
            ts.codigo AS codigo_tipo, ts.nombre AS tipo, t.nombre_completo AS trabajador,
            t.dni, a.nombre AS area, he.minutos_aprobados
     FROM solicitudes_trabajador s
     INNER JOIN tipos_solicitud ts ON ts.id_tipo_solicitud = s.id_tipo_solicitud
     INNER JOIN trabajadores t ON t.id_trabajador = s.id_trabajador
     INNER JOIN areas a ON a.id_area = t.id_area
     LEFT JOIN horas_extra he ON he.id_solicitud = s.id_solicitud
     ${where}
     ORDER BY s.creado_en DESC`,
    params
  );

  res.json({ ok: true, solicitudes });
}));

router.get('/mias', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const id_trabajador = req.query.id_trabajador || req.usuario.id_trabajador;

  if (!id_trabajador) {
    throw httpError(400, 'Trabajador obligatorio');
  }

  if (req.usuario.rol !== 'admin' && Number(req.usuario.id_trabajador) !== Number(id_trabajador)) {
    throw httpError(403, 'Solo puedes consultar tus solicitudes');
  }

  const solicitudes = await consultar(
    `SELECT s.id_solicitud, s.fecha_solicitud, s.motivo, s.url_adjunto, s.estado,
            ts.codigo AS codigo_tipo, ts.nombre AS tipo, a.decision, a.comentario, a.decidido_en
     FROM solicitudes_trabajador s
     INNER JOIN tipos_solicitud ts ON ts.id_tipo_solicitud = s.id_tipo_solicitud
     LEFT JOIN aprobaciones_solicitud a ON a.id_solicitud = s.id_solicitud
     WHERE s.id_trabajador = :id_trabajador
     ORDER BY s.creado_en DESC`,
    { id_trabajador }
  );

  res.json({ ok: true, solicitudes });
}));

router.post('/', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const datos = {
    id_trabajador: validarId(req.body.id_trabajador, 'Trabajador'),
    codigo_tipo: requerido(req.body.codigo_tipo, 'Tipo de solicitud'),
    id_asistencia: idOpcional(req.body.id_asistencia, 'Asistencia'),
    fecha_solicitud: validarFecha(req.body.fecha_solicitud, 'Fecha de solicitud'),
    motivo: limitarTexto(requerido(req.body.motivo, 'Motivo'), 'Motivo', 1000),
    url_adjunto: validarUrl(req.body.url_adjunto, 'Adjunto')
  };

  if (datos.motivo.length < 10) {
    throw httpError(400, 'Motivo debe tener al menos 10 caracteres');
  }

  if (req.usuario.rol !== 'admin' && Number(req.usuario.id_trabajador) !== Number(datos.id_trabajador)) {
    throw httpError(403, 'Solo puedes crear solicitudes para tu trabajador vinculado');
  }

  const trabajadores = await consultar(
    'SELECT id_trabajador FROM trabajadores WHERE id_trabajador = :id_trabajador AND activo = true AND eliminado_en IS NULL LIMIT 1',
    { id_trabajador: datos.id_trabajador }
  );

  if (!trabajadores.length) {
    throw httpError(400, 'Trabajador no valido o inactivo');
  }

  const tipos = await consultar(
    'SELECT id_tipo_solicitud FROM tipos_solicitud WHERE codigo = :codigo_tipo LIMIT 1',
    { codigo_tipo: datos.codigo_tipo }
  );

  if (!tipos.length) {
    throw httpError(400, 'Tipo de solicitud no valido');
  }

  if (datos.id_asistencia) {
    const asistencias = await consultar(
      `SELECT id_asistencia
         FROM registros_asistencia
        WHERE id_asistencia = :id_asistencia
          AND id_trabajador = :id_trabajador
        LIMIT 1`,
      { id_asistencia: datos.id_asistencia, id_trabajador: datos.id_trabajador }
    );

    if (!asistencias.length) {
      throw httpError(400, 'La asistencia no pertenece al trabajador indicado');
    }
  }

  const resultado = await consultar(
    `INSERT INTO solicitudes_trabajador
     (id_trabajador, id_tipo_solicitud, id_asistencia, fecha_solicitud, motivo, url_adjunto)
     VALUES (:id_trabajador, :id_tipo_solicitud, :id_asistencia, :fecha_solicitud, :motivo, :url_adjunto)`,
    {
      id_trabajador: datos.id_trabajador,
      id_tipo_solicitud: tipos[0].id_tipo_solicitud,
      id_asistencia: datos.id_asistencia,
      fecha_solicitud: datos.fecha_solicitud,
      motivo: datos.motivo,
      url_adjunto: datos.url_adjunto
    }
  );

  await auditar(req, {
    accion: 'crear_solicitud',
    entidad: 'solicitudes_trabajador',
    id_entidad: resultado.insertId,
    datos_nuevos: datos
  });

  res.status(201).json({ ok: true, id_solicitud: resultado.insertId });
}));

router.put('/:id_solicitud', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const id_solicitud = validarId(req.params.id_solicitud, 'Solicitud');
  const datos = {
    codigo_tipo: requerido(req.body.codigo_tipo, 'Tipo de solicitud'),
    fecha_solicitud: validarFecha(req.body.fecha_solicitud, 'Fecha de solicitud'),
    motivo: limitarTexto(requerido(req.body.motivo, 'Motivo'), 'Motivo', 1000),
    url_adjunto: validarUrl(req.body.url_adjunto, 'Adjunto')
  };

  if (datos.motivo.length < 10) {
    throw httpError(400, 'Motivo debe tener al menos 10 caracteres');
  }

  const solicitudes = await consultar(
    `SELECT s.id_solicitud, s.id_trabajador, s.id_tipo_solicitud, s.fecha_solicitud,
            s.motivo, s.url_adjunto, s.estado, ts.codigo AS codigo_tipo
     FROM solicitudes_trabajador s
     INNER JOIN tipos_solicitud ts ON ts.id_tipo_solicitud = s.id_tipo_solicitud
     WHERE s.id_solicitud = :id_solicitud
     LIMIT 1`,
    { id_solicitud }
  );

  if (!solicitudes.length) {
    throw httpError(404, 'Solicitud no encontrada');
  }

  const solicitud = solicitudes[0];

  if (solicitud.estado !== 'pendiente') {
    throw httpError(409, 'Solo se pueden editar solicitudes pendientes');
  }

  if (req.usuario.rol !== 'admin' && Number(req.usuario.id_trabajador) !== Number(solicitud.id_trabajador)) {
    throw httpError(403, 'Solo puedes editar tus solicitudes');
  }

  const tipos = await consultar(
    'SELECT id_tipo_solicitud FROM tipos_solicitud WHERE codigo = :codigo_tipo LIMIT 1',
    { codigo_tipo: datos.codigo_tipo }
  );

  if (!tipos.length) {
    throw httpError(400, 'Tipo de solicitud no valido');
  }

  await consultar(
    `UPDATE solicitudes_trabajador
     SET id_tipo_solicitud = :id_tipo_solicitud,
         fecha_solicitud = :fecha_solicitud,
         motivo = :motivo,
         url_adjunto = :url_adjunto,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_solicitud = :id_solicitud`,
    {
      id_solicitud,
      id_tipo_solicitud: tipos[0].id_tipo_solicitud,
      fecha_solicitud: datos.fecha_solicitud,
      motivo: datos.motivo,
      url_adjunto: datos.url_adjunto
    }
  );

  await auditar(req, {
    accion: 'actualizar_solicitud',
    entidad: 'solicitudes_trabajador',
    id_entidad: id_solicitud,
    datos_anteriores: solicitud,
    datos_nuevos: datos
  });

  res.json({ ok: true, mensaje: 'Solicitud actualizada' });
}));

router.patch('/:id_solicitud/cancelar', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const solicitudes = await consultar(
    `SELECT id_solicitud, id_trabajador, fecha_solicitud, motivo, url_adjunto, estado
     FROM solicitudes_trabajador
     WHERE id_solicitud = :id_solicitud
     LIMIT 1`,
    { id_solicitud: req.params.id_solicitud }
  );

  if (!solicitudes.length) {
    throw httpError(404, 'Solicitud no encontrada');
  }

  const solicitud = solicitudes[0];

  if (solicitud.estado !== 'pendiente') {
    throw httpError(409, 'Solo se pueden cancelar solicitudes pendientes');
  }

  if (req.usuario.rol !== 'admin' && Number(req.usuario.id_trabajador) !== Number(solicitud.id_trabajador)) {
    throw httpError(403, 'Solo puedes cancelar tus solicitudes');
  }

  await consultar(
    `UPDATE solicitudes_trabajador
     SET estado = 'rechazada',
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_solicitud = :id_solicitud`,
    { id_solicitud: req.params.id_solicitud }
  );

  await auditar(req, {
    accion: 'cancelar_solicitud',
    entidad: 'solicitudes_trabajador',
    id_entidad: req.params.id_solicitud,
    datos_anteriores: solicitud,
    datos_nuevos: { estado: 'rechazada', cancelada_por_usuario: req.usuario.id_usuario }
  });

  res.json({ ok: true, mensaje: 'Solicitud cancelada' });
}));

router.post('/:id_solicitud/decidir', autorizarRoles('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const id_solicitud = validarId(req.params.id_solicitud, 'Solicitud');
  const { decision } = req.body;
  const comentario = limitarTexto(requerido(req.body.comentario, 'Comentario'), 'Comentario', 1000);

  if (!['aprobada', 'rechazada'].includes(decision)) {
    throw httpError(400, 'Decision no valida');
  }

  const solicitudes = await consultar(
    `SELECT s.id_solicitud, s.id_trabajador, s.fecha_solicitud, s.estado, t.id_area,
            ts.codigo AS codigo_tipo
     FROM solicitudes_trabajador s
     INNER JOIN trabajadores t ON t.id_trabajador = s.id_trabajador
     INNER JOIN tipos_solicitud ts ON ts.id_tipo_solicitud = s.id_tipo_solicitud
     WHERE s.id_solicitud = :id_solicitud
     LIMIT 1`,
    { id_solicitud }
  );

  if (!solicitudes.length) {
    throw httpError(404, 'Solicitud no encontrada');
  }

  const solicitud = solicitudes[0];

  if (solicitud.estado !== 'pendiente') {
    throw httpError(409, 'La solicitud ya fue decidida');
  }

  if (req.usuario.rol === 'supervisor') {
    if (Number(solicitud.id_area) !== Number(req.usuario.id_area)) {
      throw httpError(403, 'Solo puedes decidir solicitudes de tu area');
    }
  }

  const esHoraExtraAprobada = decision === 'aprobada' && solicitud.codigo_tipo === 'horas_extra';
  const minutos = esHoraExtraAprobada
    ? validarEnteroRango(req.body.minutos_aprobados, 'Minutos aprobados', 1, 1440)
    : 0;

  await transaccion(async (conexion) => {
    await conexion.execute(
      `INSERT INTO aprobaciones_solicitud (id_solicitud, decidido_por_usuario, decision, comentario)
       VALUES (?, ?, ?, ?)`,
      [id_solicitud, req.usuario.id_usuario, decision, comentario]
    );

    if (esHoraExtraAprobada) {
      await conexion.execute(
        `INSERT INTO horas_extra
         (id_solicitud, id_trabajador, fecha_hora_extra, minutos_aprobados, aprobado_por_usuario)
         VALUES (?, ?, ?, ?, ?)`,
        [id_solicitud, solicitud.id_trabajador, solicitud.fecha_solicitud, minutos, req.usuario.id_usuario]
      );
    }
  });

  await auditar(req, {
    accion: 'decidir_solicitud',
    entidad: 'solicitudes_trabajador',
    id_entidad: id_solicitud,
    datos_anteriores: { id_solicitud: solicitud.id_solicitud, estado: solicitud.estado },
    datos_nuevos: { decision, comentario, minutos_aprobados: esHoraExtraAprobada ? minutos : null }
  });

  res.json({ ok: true, mensaje: `Solicitud ${decision}` });
}));

module.exports = router;

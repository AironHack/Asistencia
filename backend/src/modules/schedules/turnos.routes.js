const { Router } = require('express');

const { consultar } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');
const {
  requerido,
  limitarTexto,
  validarHora,
  validarFecha,
  validarEnteroRango,
  validarId,
  validarBooleano
} = require('../../shared/validators');

const router = Router();

router.use(autenticar);

router.get('/', autorizarRoles('admin', 'supervisor'), asyncHandler(async (_req, res) => {
  const turnos = await consultar(
    `SELECT id_turno, nombre, hora_entrada, hora_salida, minutos_tolerancia, activo
     FROM turnos
     ORDER BY hora_entrada`
  );

  res.json({ ok: true, turnos });
}));

router.post('/', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const datos = {
    nombre: limitarTexto(requerido(req.body.nombre, 'Nombre'), 'Nombre', 120),
    hora_entrada: validarHora(req.body.hora_entrada, 'Hora de entrada'),
    hora_salida: validarHora(req.body.hora_salida, 'Hora de salida'),
    minutos_tolerancia: validarEnteroRango(req.body.minutos_tolerancia ?? 0, 'Minutos de tolerancia', 0, 240)
  };

  if (datos.hora_entrada === datos.hora_salida) {
    throw httpError(400, 'La hora de entrada y salida no pueden ser iguales');
  }

  const resultado = await consultar(
    `INSERT INTO turnos (nombre, hora_entrada, hora_salida, minutos_tolerancia)
     VALUES (:nombre, :hora_entrada, :hora_salida, :minutos_tolerancia)`,
    datos
  );

  await auditar(req, {
    accion: 'crear_turno',
    entidad: 'turnos',
    id_entidad: resultado.insertId,
    datos_nuevos: datos
  });

  res.status(201).json({ ok: true, id_turno: resultado.insertId });
}));

router.put('/:id_turno', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_turno = validarId(req.params.id_turno, 'Turno');
  const datos = {
    nombre: limitarTexto(requerido(req.body.nombre, 'Nombre'), 'Nombre', 120),
    hora_entrada: validarHora(req.body.hora_entrada, 'Hora de entrada'),
    hora_salida: validarHora(req.body.hora_salida, 'Hora de salida'),
    minutos_tolerancia: validarEnteroRango(req.body.minutos_tolerancia ?? 0, 'Minutos de tolerancia', 0, 240),
    activo: validarBooleano(req.body.activo ?? true)
  };

  if (datos.hora_entrada === datos.hora_salida) {
    throw httpError(400, 'La hora de entrada y salida no pueden ser iguales');
  }

  const [antes] = await consultar(
    'SELECT * FROM turnos WHERE id_turno = :id_turno LIMIT 1',
    { id_turno }
  );

  if (!antes) {
    throw httpError(404, 'Turno no encontrado');
  }

  await consultar(
    `UPDATE turnos
     SET nombre = :nombre,
         hora_entrada = :hora_entrada,
         hora_salida = :hora_salida,
         minutos_tolerancia = :minutos_tolerancia,
         activo = :activo,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_turno = :id_turno`,
    {
      id_turno,
      ...datos
    }
  );

  await auditar(req, {
    accion: 'actualizar_turno',
    entidad: 'turnos',
    id_entidad: id_turno,
    datos_anteriores: antes,
    datos_nuevos: datos
  });

  res.json({ ok: true, mensaje: 'Turno actualizado' });
}));

router.get('/asignaciones/listado', autorizarRoles('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const filtros = [];
  const params = {};

  if (req.usuario.rol === 'supervisor') {
    filtros.push('t.id_area = :id_area_usuario');
    params.id_area_usuario = req.usuario.id_area;
  }

  if (req.query.id_trabajador) {
    filtros.push('at.id_trabajador = :id_trabajador');
    params.id_trabajador = req.query.id_trabajador;
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const asignaciones = await consultar(
    `SELECT at.id_asignacion_turno, at.id_trabajador, at.id_turno,
            at.fecha_inicio, at.fecha_fin, at.creado_en,
            t.nombre_completo AS trabajador, t.dni, a.nombre AS area,
            tu.nombre AS turno, tu.hora_entrada, tu.hora_salida,
            u.nombre_completo AS asignado_por
     FROM asignaciones_turno at
     INNER JOIN trabajadores t ON t.id_trabajador = at.id_trabajador
     INNER JOIN areas a ON a.id_area = t.id_area
     INNER JOIN turnos tu ON tu.id_turno = at.id_turno
     LEFT JOIN usuarios u ON u.id_usuario = at.asignado_por_usuario
     ${where}
     ORDER BY at.fecha_inicio DESC, at.creado_en DESC
     LIMIT 120`,
    params
  );

  res.json({ ok: true, asignaciones });
}));

router.post('/asignar', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const datos = {
    id_trabajador: validarId(req.body.id_trabajador, 'Trabajador'),
    id_turno: validarId(req.body.id_turno, 'Turno'),
    fecha_inicio: validarFecha(req.body.fecha_inicio, 'Fecha de inicio'),
    fecha_fin: req.body.fecha_fin ? validarFecha(req.body.fecha_fin, 'Fecha fin') : null
  };

  if (datos.fecha_fin && datos.fecha_fin < datos.fecha_inicio) {
    throw httpError(400, 'Fecha fin no puede ser menor que fecha inicio');
  }

  const trabajadores = await consultar(
    'SELECT id_trabajador FROM trabajadores WHERE id_trabajador = :id_trabajador AND activo = true AND eliminado_en IS NULL LIMIT 1',
    { id_trabajador: datos.id_trabajador }
  );

  if (!trabajadores.length) {
    throw httpError(400, 'Trabajador no valido o inactivo');
  }

  const turnos = await consultar(
    'SELECT id_turno FROM turnos WHERE id_turno = :id_turno AND activo = true LIMIT 1',
    { id_turno: datos.id_turno }
  );

  if (!turnos.length) {
    throw httpError(400, 'Turno no valido o inactivo');
  }

  const cruces = await consultar(
    `SELECT id_asignacion_turno
       FROM asignaciones_turno
      WHERE id_trabajador = :id_trabajador
        AND fecha_inicio <= COALESCE(:fecha_fin, '9999-12-31')
        AND COALESCE(fecha_fin, '9999-12-31') >= :fecha_inicio
      LIMIT 1`,
    datos
  );

  if (cruces.length) {
    throw httpError(409, 'El trabajador ya tiene un turno asignado en ese rango de fechas');
  }

  const resultadoAsignacion = await consultar(
    `INSERT INTO asignaciones_turno (id_trabajador, id_turno, fecha_inicio, fecha_fin, asignado_por_usuario)
     VALUES (:id_trabajador, :id_turno, :fecha_inicio, :fecha_fin, :asignado_por_usuario)`,
    {
      ...datos,
      asignado_por_usuario: req.usuario.id_usuario
    }
  );

  await consultar(
    `UPDATE trabajadores
     SET id_turno_actual = :id_turno
     WHERE id_trabajador = :id_trabajador`,
    { id_turno: datos.id_turno, id_trabajador: datos.id_trabajador }
  );

  await auditar(req, {
    accion: 'asignar_turno',
    entidad: 'asignaciones_turno',
    id_entidad: resultadoAsignacion.insertId,
    datos_nuevos: datos
  });

  res.json({ ok: true, mensaje: 'Turno asignado' });
}));

module.exports = router;

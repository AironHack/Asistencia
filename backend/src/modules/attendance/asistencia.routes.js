const { Router } = require('express');

const { consultar } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');
const { validarFechaHora, validarId, validarEnteroRango } = require('../../shared/validators');
const { validarQrFirmado } = require('../qr/qr.service');
const { registrarAsistencia, obtenerTrabajadorActivo, fechaMysql } = require('./asistencia.service');

const router = Router();

router.use(autenticar);

async function configuracionBoolean(clave, fallback = false) {
  const [config] = await consultar(
    'SELECT JSON_UNQUOTE(valor) AS valor FROM configuraciones WHERE clave = :clave LIMIT 1',
    { clave }
  );

  if (!config) return fallback;
  return ['true', '1', 'si', 'yes'].includes(String(config.valor).toLowerCase());
}

async function configuracionNumero(clave, fallback) {
  const [config] = await consultar(
    'SELECT JSON_UNQUOTE(valor) AS valor FROM configuraciones WHERE clave = :clave LIMIT 1',
    { clave }
  );
  const valor = Number(config?.valor ?? fallback);
  return Number.isFinite(valor) ? valor : fallback;
}

async function validarConfirmacionFacialQr(req, id_trabajador) {
  const requiereFacial = await configuracionBoolean('qr_fotocheck_requiere_facial', false);
  if (!requiereFacial) return null;

  const confirmacion = req.body.confirmacion_facial || {};
  if (!confirmacion.id_trabajador) {
    throw httpError(428, 'Este fotocheck requiere verificacion facial antes de registrar asistencia');
  }

  const idConfirmado = validarId(confirmacion.id_trabajador, 'Trabajador confirmado');
  const confianza = Number(confirmacion.confianza ?? 0);
  const confianzaMinima = await configuracionNumero('confianza_facial_minima', 0.85);

  if (Number(idConfirmado) !== Number(id_trabajador)) {
    throw httpError(403, 'El rostro verificado no pertenece al QR escaneado');
  }

  if (confirmacion.confirmado !== true || !Number.isFinite(confianza) || confianza < confianzaMinima) {
    throw httpError(428, `Este fotocheck requiere verificacion facial minima de ${Math.round(confianzaMinima * 100)}%`);
  }

  await consultar(
    `INSERT INTO intentos_reconocimiento_facial
     (id_trabajador_propuesto, confianza, confirmado, confirmado_por_usuario, confirmado_en, informacion_dispositivo)
     VALUES (:id_trabajador, :confianza, true, :id_usuario, CURRENT_TIMESTAMP, CAST(:informacion AS JSON))`,
    {
      id_trabajador,
      confianza,
      id_usuario: req.usuario.id_usuario,
      informacion: JSON.stringify({ ...(req.body.informacion_dispositivo || {}), motivo: 'confirmacion_qr_fotocheck' })
    }
  );

  return { confianza, confianza_minima: confianzaMinima };
}

router.post('/registrar-qr', autorizarRoles('admin', 'vigilante'), asyncHandler(async (req, res) => {
  const validacion = validarQrFirmado(req.body.qr);

  if (!validacion.valido) {
    throw httpError(400, validacion.motivo);
  }

  const tokens = await consultar(
    `SELECT tq.id_token_qr, tq.estado, tq.expira_en, t.activo
     FROM tokens_qr tq
     INNER JOIN trabajadores t ON t.id_trabajador = tq.id_trabajador
     WHERE tq.token_jti = :token_jti
       AND tq.id_trabajador = :id_trabajador
       AND tq.firma = :firma
     LIMIT 1`,
    {
      token_jti: validacion.token_jti,
      id_trabajador: validacion.id_trabajador,
      firma: req.body.qr.firma
    }
  );

  if (!tokens.length || tokens[0].estado !== 'activo' || !tokens[0].activo) {
    throw httpError(400, 'QR revocado, inactivo o no encontrado');
  }

  if (req.body.qr?.payload?.tipo !== 'fotocheck_permanente' && new Date(tokens[0].expira_en).getTime() < Date.now()) {
    await consultar(
      `UPDATE tokens_qr
       SET estado = 'expirado'
       WHERE token_jti = :token_jti`,
      { token_jti: validacion.token_jti }
    );
    throw httpError(400, 'QR expirado');
  }

  const confirmacionQr = req.body.qr?.payload?.tipo === 'fotocheck_permanente'
    ? await validarConfirmacionFacialQr(req, validacion.id_trabajador)
    : null;

  const registro = await registrarAsistencia({
    id_trabajador: validacion.id_trabajador,
    origen: 'qr',
    registrado_por_usuario: req.usuario.id_usuario,
    informacion_dispositivo: {
      ...(req.body.informacion_dispositivo || {}),
      confirmacion_facial_qr: confirmacionQr
    }
  });

  await auditar(req, {
    accion: 'registrar_asistencia_qr',
    entidad: 'registros_asistencia',
    id_entidad: registro.id_asistencia,
    datos_nuevos: registro
  });

  res.status(201).json({ ok: true, registro });
}));

router.post('/registrar-facial', autorizarRoles('admin', 'vigilante'), asyncHandler(async (req, res) => {
  const { id_trabajador, confianza, confirmado, informacion_dispositivo } = req.body;

  if (!id_trabajador || confirmado !== true) {
    throw httpError(400, 'El modo facial requiere trabajador identificado y confirmacion manual');
  }

  const idTrabajador = validarId(id_trabajador, 'Trabajador');
  const confianzaNormalizada = Number(confianza ?? 0);

  if (!Number.isFinite(confianzaNormalizada) || confianzaNormalizada < 0 || confianzaNormalizada > 1) {
    throw httpError(400, 'Confianza facial debe estar entre 0 y 1');
  }

  await consultar(
    `INSERT INTO intentos_reconocimiento_facial
     (id_trabajador_propuesto, confianza, confirmado, confirmado_por_usuario, confirmado_en, informacion_dispositivo)
     VALUES (:id_trabajador, :confianza, true, :id_usuario, CURRENT_TIMESTAMP, CAST(:informacion AS JSON))`,
    {
      id_trabajador: idTrabajador,
      confianza: confianzaNormalizada,
      id_usuario: req.usuario.id_usuario,
      informacion: JSON.stringify(informacion_dispositivo || {})
    }
  );

  const registro = await registrarAsistencia({
    id_trabajador: idTrabajador,
    origen: 'facial',
    registrado_por_usuario: req.usuario.id_usuario,
    informacion_dispositivo: informacion_dispositivo || {}
  });

  await auditar(req, {
    accion: 'registrar_asistencia_facial',
    entidad: 'registros_asistencia',
    id_entidad: registro.id_asistencia,
    datos_nuevos: registro
  });

  res.status(201).json({ ok: true, registro });
}));

router.post('/registrar-manual', autorizarRoles('admin', 'vigilante'), asyncHandler(async (req, res) => {
  const { id_trabajador, informacion_dispositivo } = req.body;

  const idTrabajador = validarId(id_trabajador, 'Trabajador');

  const registro = await registrarAsistencia({
    id_trabajador: idTrabajador,
    origen: 'manual',
    registrado_por_usuario: req.usuario.id_usuario,
    informacion_dispositivo: informacion_dispositivo || {}
  });

  await auditar(req, {
    accion: 'registrar_asistencia_manual',
    entidad: 'registros_asistencia',
    id_entidad: registro.id_asistencia,
    datos_nuevos: registro
  });

  res.status(201).json({ ok: true, registro });
}));

router.get('/hoy', autorizarRoles('admin', 'supervisor', 'vigilante'), asyncHandler(async (req, res) => {
  const filtros = [];
  const params = { fecha_hoy: fechaMysql() };

  if (req.usuario.rol === 'supervisor') {
    filtros.push('t.id_area = :id_area_usuario');
    params.id_area_usuario = req.usuario.id_area;
  }

  filtros.push('t.activo = true');
  filtros.push('t.eliminado_en IS NULL');

  const where = `WHERE ${filtros.join(' AND ')}`;

  const asistencias = await consultar(
    `SELECT
       t.id_trabajador,
       t.nombre_completo,
       t.dni,
       a.nombre AS area,
       c.nombre AS cargo,
       tu.nombre AS turno,
       entrada.id_asistencia AS id_asistencia_entrada,
       salida.id_asistencia AS id_asistencia_salida,
       entrada.marcado_en AS hora_entrada,
       salida.marcado_en AS hora_salida,
       COALESCE(entrada.estado, 'ausente') AS estado,
       COALESCE(entrada.minutos_tardanza, 0) AS minutos_tardanza,
       entrada.origen AS origen_entrada,
       salida.origen AS origen_salida,
       entrada.observacion AS observacion_entrada,
       salida.observacion AS observacion_salida
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
     ORDER BY t.nombre_completo`
    ,
    params
  );

  res.json({ ok: true, asistencias });
}));

router.patch('/:id_asistencia/corregir', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const { marcado_en, estado, minutos_tardanza = 0, observacion } = req.body;
  const id_asistencia = validarId(req.params.id_asistencia, 'Asistencia');
  const marcado = validarFechaHora(marcado_en, 'Hora marcada');

  if (!['puntual', 'tardanza', 'justificado', 'pendiente_salida'].includes(estado)) {
    throw httpError(400, 'Estado no valido');
  }

  const minutos = validarEnteroRango(minutos_tardanza || 0, 'Minutos de tardanza', 0, 1440);

  const [antes] = await consultar(
    `SELECT id_asistencia, id_trabajador, fecha_asistencia, tipo_marcacion, marcado_en,
            origen, estado, minutos_tardanza, observacion
     FROM registros_asistencia
    WHERE id_asistencia = :id_asistencia
     LIMIT 1`,
    { id_asistencia }
  );

  if (!antes) {
    throw httpError(404, 'Asistencia no encontrada');
  }

  await consultar(
    `UPDATE registros_asistencia
     SET marcado_en = :marcado_en,
         estado = :estado,
         minutos_tardanza = :minutos_tardanza,
         observacion = :observacion,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_asistencia = :id_asistencia`,
    {
      id_asistencia,
      marcado_en: marcado,
      estado,
      minutos_tardanza: minutos,
      observacion: observacion || null
    }
  );

  await auditar(req, {
    accion: 'corregir_asistencia',
    entidad: 'registros_asistencia',
    id_entidad: id_asistencia,
    datos_anteriores: antes,
    datos_nuevos: { marcado_en: marcado, estado, minutos_tardanza: minutos, observacion: observacion || null }
  });

  res.json({ ok: true, mensaje: 'Asistencia corregida' });
}));

router.get('/trabajador/:id_trabajador', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const trabajador = await obtenerTrabajadorActivo(req.params.id_trabajador);

  if (['trabajador', 'vigilante'].includes(req.usuario.rol) && Number(req.usuario.id_trabajador) !== Number(req.params.id_trabajador)) {
    throw httpError(403, 'Solo puedes consultar tu asistencia');
  }

  if (req.usuario.rol === 'supervisor' && Number(req.usuario.id_area) !== Number(trabajador.id_area)) {
    throw httpError(403, 'Solo puedes consultar trabajadores de tu area');
  }

  const asistencias = await consultar(
    `SELECT id_asistencia, fecha_asistencia, tipo_marcacion, marcado_en, origen, estado, minutos_tardanza
     FROM registros_asistencia
     WHERE id_trabajador = :id_trabajador
       AND (:fecha_inicio IS NULL OR fecha_asistencia >= :fecha_inicio)
       AND (:fecha_fin IS NULL OR fecha_asistencia <= :fecha_fin)
     ORDER BY fecha_asistencia DESC, marcado_en DESC`,
    {
      id_trabajador: req.params.id_trabajador,
      fecha_inicio: req.query.fecha_inicio || null,
      fecha_fin: req.query.fecha_fin || null
    }
  );

  res.json({ ok: true, asistencias });
}));

module.exports = router;

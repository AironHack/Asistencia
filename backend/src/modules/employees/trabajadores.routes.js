const { Router } = require('express');
const bcrypt = require('bcryptjs');

const { consultar, transaccion } = require('../../config/database');
const { env } = require('../../config/env');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');
const {
  requerido,
  limitarTexto,
  validarCorreo,
  validarUrl,
  validarId,
  idOpcional,
  validarDni,
  validarUsuario,
  validarContrasena,
  validarBooleano,
  texto
} = require('../../shared/validators');

const router = Router();

router.use(autenticar);

async function validarRelacionesTrabajador(datos, idTrabajadorActual = null) {
  const areas = await consultar(
    'SELECT id_area FROM areas WHERE id_area = :id_area AND activo = true LIMIT 1',
    { id_area: datos.id_area }
  );

  if (!areas.length) {
    throw httpError(400, 'Area no valida o inactiva');
  }

  if (datos.id_cargo) {
    const cargos = await consultar(
      `SELECT id_cargo
         FROM cargos
        WHERE id_cargo = :id_cargo
          AND id_area = :id_area
          AND activo = true
        LIMIT 1`,
      { id_cargo: datos.id_cargo, id_area: datos.id_area }
    );

    if (!cargos.length) {
      throw httpError(400, 'Cargo no valido, inactivo o no pertenece al area');
    }
  }

  if (datos.id_turno_actual) {
    const turnos = await consultar(
      'SELECT id_turno FROM turnos WHERE id_turno = :id_turno AND activo = true LIMIT 1',
      { id_turno: datos.id_turno_actual }
    );

    if (!turnos.length) {
      throw httpError(400, 'Turno no valido o inactivo');
    }
  }

  if (datos.id_jefe_trabajador) {
    if (idTrabajadorActual && Number(datos.id_jefe_trabajador) === Number(idTrabajadorActual)) {
      throw httpError(400, 'Un trabajador no puede ser su propio jefe');
    }

    const jefes = await consultar(
      'SELECT id_trabajador FROM trabajadores WHERE id_trabajador = :id_jefe AND activo = true AND eliminado_en IS NULL LIMIT 1',
      { id_jefe: datos.id_jefe_trabajador }
    );

    if (!jefes.length) {
      throw httpError(400, 'Jefe no valido o inactivo');
    }
  }
}

function normalizarTrabajador(body, incluirUsuario = false) {
  const datos = {
    nombre_completo: limitarTexto(requerido(body.nombre_completo, 'Nombre'), 'Nombre', 160),
    dni: validarDni(body.dni),
    correo: validarCorreo(body.correo),
    telefono: limitarTexto(body.telefono, 'Telefono', 40) || null,
    id_area: validarId(body.id_area, 'Area'),
    id_cargo: idOpcional(body.id_cargo, 'Cargo'),
    id_turno_actual: idOpcional(body.id_turno_actual, 'Turno'),
    id_jefe_trabajador: idOpcional(body.id_jefe_trabajador, 'Jefe'),
    url_foto: validarUrl(body.url_foto, 'Foto')
  };

  if (incluirUsuario) {
    const usuario = texto(body.usuario);
    const contrasena = String(body.contrasena ?? '');

    if ((usuario && !contrasena) || (!usuario && contrasena)) {
      throw httpError(400, 'Para crear acceso web debes enviar usuario y contrasena');
    }

    datos.usuario = usuario ? validarUsuario(usuario) : null;
    datos.contrasena = usuario ? validarContrasena(contrasena) : null;
  }

  return datos;
}

router.get('/catalogos/base', autorizarRoles('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const filtrosArea = ['activo = true'];
  const params = {};

  if (req.usuario.rol === 'admin' && req.query.incluir_inactivos === 'true') {
    filtrosArea.length = 0;
  }

  if (req.usuario.rol === 'supervisor') {
    filtrosArea.push('id_area = :id_area_usuario');
    params.id_area_usuario = req.usuario.id_area;
  }

  const whereAreas = filtrosArea.length ? `WHERE ${filtrosArea.join(' AND ')}` : '';

  const areas = await consultar(
    `SELECT id_area, nombre, activo
     FROM areas
     ${whereAreas}
     ORDER BY nombre`,
    params
  );

  const filtrosCargo = [];

  if (!(req.usuario.rol === 'admin' && req.query.incluir_inactivos === 'true')) {
    filtrosCargo.push('c.activo = true');
  }

  if (req.usuario.rol === 'supervisor') {
    filtrosCargo.push('c.id_area = :id_area_usuario');
  }

  const whereCargos = filtrosCargo.length ? `WHERE ${filtrosCargo.join(' AND ')}` : '';

  const cargos = await consultar(
    `SELECT c.id_cargo, c.id_area, c.nombre, c.activo, a.nombre AS area, a.activo AS area_activa
     FROM cargos c
     INNER JOIN areas a ON a.id_area = c.id_area
     ${whereCargos}
     ORDER BY a.nombre, c.nombre`,
    params
  );

  res.json({ ok: true, areas, cargos });
}));

router.post('/catalogos/areas', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const nombre = limitarTexto(requerido(req.body.nombre, 'Nombre de area'), 'Nombre de area', 120);

  const resultado = await consultar(
    `INSERT INTO areas (nombre, activo)
     VALUES (:nombre, true)
     ON DUPLICATE KEY UPDATE
       activo = true,
       actualizado_en = CURRENT_TIMESTAMP`,
    { nombre }
  );

  await auditar(req, {
    accion: 'crear_area',
    entidad: 'areas',
    id_entidad: resultado.insertId || null,
    datos_nuevos: { nombre, activo: true }
  });

  res.status(201).json({ ok: true, id_area: resultado.insertId || null });
}));

router.post('/catalogos/cargos', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_area = validarId(req.body.id_area, 'Area');
  const nombre = limitarTexto(requerido(req.body.nombre, 'Nombre de cargo'), 'Nombre de cargo', 120);

  const areas = await consultar(
    'SELECT id_area FROM areas WHERE id_area = :id_area AND activo = true LIMIT 1',
    { id_area }
  );

  if (!areas.length) {
    throw httpError(400, 'Area no valida');
  }

  const resultado = await consultar(
    `INSERT INTO cargos (id_area, nombre, activo)
     VALUES (:id_area, :nombre, true)
     ON DUPLICATE KEY UPDATE
       activo = true,
       actualizado_en = CURRENT_TIMESTAMP`,
    { id_area, nombre }
  );

  await auditar(req, {
    accion: 'crear_cargo',
    entidad: 'cargos',
    id_entidad: resultado.insertId || null,
    datos_nuevos: { id_area, nombre, activo: true }
  });

  res.status(201).json({ ok: true, id_cargo: resultado.insertId || null });
}));

router.put('/catalogos/areas/:id_area', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_area = validarId(req.params.id_area, 'Area');
  const nombre = limitarTexto(requerido(req.body.nombre, 'Nombre de area'), 'Nombre de area', 120);
  const activo = validarBooleano(req.body.activo ?? true);

  const [antes] = await consultar(
    'SELECT id_area, nombre, activo FROM areas WHERE id_area = :id_area LIMIT 1',
    { id_area }
  );

  if (!antes) {
    throw httpError(404, 'Area no encontrada');
  }

  await consultar(
    `UPDATE areas
     SET nombre = :nombre,
         activo = :activo,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_area = :id_area`,
    {
      id_area,
      nombre,
      activo
    }
  );

  await auditar(req, {
    accion: 'actualizar_area',
    entidad: 'areas',
    id_entidad: id_area,
    datos_anteriores: antes,
    datos_nuevos: { nombre, activo }
  });

  res.json({ ok: true, mensaje: 'Area actualizada' });
}));

router.put('/catalogos/cargos/:id_cargo', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_cargo = validarId(req.params.id_cargo, 'Cargo');
  const id_area = validarId(req.body.id_area, 'Area');
  const nombre = limitarTexto(requerido(req.body.nombre, 'Nombre de cargo'), 'Nombre de cargo', 120);
  const activo = validarBooleano(req.body.activo ?? true);

  const areas = await consultar(
    'SELECT id_area FROM areas WHERE id_area = :id_area AND activo = true LIMIT 1',
    { id_area }
  );

  if (!areas.length) {
    throw httpError(400, 'Area no valida o inactiva');
  }

  const [antes] = await consultar(
    'SELECT id_cargo, id_area, nombre, activo FROM cargos WHERE id_cargo = :id_cargo LIMIT 1',
    { id_cargo }
  );

  if (!antes) {
    throw httpError(404, 'Cargo no encontrado');
  }

  await consultar(
    `UPDATE cargos
     SET id_area = :id_area,
         nombre = :nombre,
         activo = :activo,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_cargo = :id_cargo`,
    {
      id_cargo,
      id_area,
      nombre,
      activo
    }
  );

  await auditar(req, {
    accion: 'actualizar_cargo',
    entidad: 'cargos',
    id_entidad: id_cargo,
    datos_anteriores: antes,
    datos_nuevos: { id_area, nombre, activo }
  });

  res.json({ ok: true, mensaje: 'Cargo actualizado' });
}));

router.get('/', autorizarRoles('admin', 'supervisor', 'vigilante'), asyncHandler(async (req, res) => {
  const filtros = [];
  const params = {};

  if (req.usuario.rol === 'supervisor') {
    filtros.push('t.id_area = :id_area_usuario');
    params.id_area_usuario = req.usuario.id_area;
  }

  if (req.usuario.rol === 'vigilante') {
    filtros.push('t.activo = true');
    filtros.push('t.eliminado_en IS NULL');
  }

  if (req.query.id_area && req.usuario.rol !== 'vigilante') {
    filtros.push('t.id_area = :id_area');
    params.id_area = req.query.id_area;
  }

  if (req.query.estado === 'activo' && req.usuario.rol !== 'vigilante') filtros.push('t.activo = true');
  if (req.query.estado === 'inactivo' && req.usuario.rol !== 'vigilante') filtros.push('t.activo = false');

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const trabajadores = await consultar(
    `SELECT t.id_trabajador, t.id_usuario, t.id_area, t.id_cargo, t.id_turno_actual, t.nombre_completo,
            t.dni, t.correo, t.telefono, COALESCE(fp.url_imagen, t.url_foto) AS url_foto, t.activo,
            a.nombre AS area, c.nombre AS cargo, tu.nombre AS turno
     FROM trabajadores t
     INNER JOIN areas a ON a.id_area = t.id_area
     LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
     LEFT JOIN turnos tu ON tu.id_turno = t.id_turno_actual
     LEFT JOIN fotos_trabajador fp ON fp.id_trabajador = t.id_trabajador AND fp.es_principal = true
     ${where}
     ORDER BY t.nombre_completo`,
    params
  );

  res.json({ ok: true, trabajadores });
}));

router.get('/:id_trabajador', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  if (['trabajador', 'vigilante'].includes(req.usuario.rol) && Number(req.usuario.id_trabajador) !== Number(req.params.id_trabajador)) {
    throw httpError(403, 'No puedes consultar otro trabajador');
  }

  const filas = await consultar(
    `SELECT t.*, COALESCE(fp.url_imagen, t.url_foto) AS url_foto,
            a.nombre AS area, c.nombre AS cargo, tu.nombre AS turno
     FROM trabajadores t
     INNER JOIN areas a ON a.id_area = t.id_area
     LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
     LEFT JOIN turnos tu ON tu.id_turno = t.id_turno_actual
     LEFT JOIN fotos_trabajador fp ON fp.id_trabajador = t.id_trabajador AND fp.es_principal = true
     WHERE t.id_trabajador = :id_trabajador
     LIMIT 1`,
    { id_trabajador: req.params.id_trabajador }
  );

  if (!filas.length) {
    throw httpError(404, 'Trabajador no encontrado');
  }

  if (req.usuario.rol === 'supervisor' && Number(req.usuario.id_area) !== Number(filas[0].id_area)) {
    throw httpError(403, 'No puedes consultar trabajadores de otra area');
  }

  res.json({ ok: true, trabajador: filas[0] });
}));

router.get('/:id_trabajador/fotos', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const id_trabajador = validarId(req.params.id_trabajador, 'Trabajador');

  const [trabajador] = await consultar(
    'SELECT id_trabajador, id_area, nombre_completo FROM trabajadores WHERE id_trabajador = :id_trabajador AND eliminado_en IS NULL LIMIT 1',
    { id_trabajador }
  );

  if (!trabajador) {
    throw httpError(404, 'Trabajador no encontrado');
  }

  if (['trabajador', 'vigilante'].includes(req.usuario.rol) && Number(req.usuario.id_trabajador) !== Number(id_trabajador)) {
    throw httpError(403, 'No puedes consultar fotos de otro trabajador');
  }

  if (req.usuario.rol === 'supervisor' && Number(req.usuario.id_area) !== Number(trabajador.id_area)) {
    throw httpError(403, 'No puedes consultar trabajadores de otra area');
  }

  const fotos = await consultar(
    `SELECT id_foto, id_trabajador, url_imagen, es_principal, creado_en
       FROM fotos_trabajador
      WHERE id_trabajador = :id_trabajador
      ORDER BY es_principal DESC, creado_en DESC`,
    { id_trabajador }
  );

  res.json({ ok: true, trabajador, fotos });
}));

router.patch('/:id_trabajador/fotos/:id_foto/principal', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_trabajador = validarId(req.params.id_trabajador, 'Trabajador');
  const id_foto = validarId(req.params.id_foto, 'Foto');

  const [foto] = await consultar(
    `SELECT f.id_foto, f.id_trabajador, f.url_imagen, f.es_principal, t.nombre_completo
       FROM fotos_trabajador f
       INNER JOIN trabajadores t ON t.id_trabajador = f.id_trabajador
      WHERE f.id_foto = :id_foto
        AND f.id_trabajador = :id_trabajador
        AND t.eliminado_en IS NULL
      LIMIT 1`,
    { id_trabajador, id_foto }
  );

  if (!foto) {
    throw httpError(404, 'Foto no encontrada');
  }

  await transaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE fotos_trabajador
          SET es_principal = false
        WHERE id_trabajador = :id_trabajador
          AND es_principal = true`,
      { id_trabajador }
    );

    await conexion.execute(
      `UPDATE fotos_trabajador
          SET es_principal = true
        WHERE id_foto = :id_foto`,
      { id_foto }
    );

    await conexion.execute(
      `UPDATE trabajadores
          SET url_foto = :url_foto,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id_trabajador = :id_trabajador`,
      { id_trabajador, url_foto: foto.url_imagen }
    );
  });

  await auditar(req, {
    accion: 'marcar_foto_principal',
    entidad: 'fotos_trabajador',
    id_entidad: id_foto,
    datos_anteriores: { id_trabajador, id_foto, es_principal: foto.es_principal },
    datos_nuevos: { id_trabajador, id_foto, es_principal: true }
  });

  res.json({ ok: true, mensaje: 'Foto principal actualizada' });
}));

router.post('/', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const datos = normalizarTrabajador(req.body, true);

  await validarRelacionesTrabajador(datos);

  const resultado = await transaccion(async (conexion) => {
    let id_usuario = null;

    if (datos.usuario && datos.contrasena) {
      const [roles] = await conexion.execute("SELECT id_rol FROM roles WHERE codigo = 'trabajador' LIMIT 1");
      const contrasena_hash = await bcrypt.hash(datos.contrasena, env.bcryptRounds);
      const [usuarioCreado] = await conexion.execute(
        `INSERT INTO usuarios (id_rol, id_area, nombre_completo, usuario, correo, contrasena_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roles[0].id_rol, datos.id_area, datos.nombre_completo, datos.usuario, datos.correo, contrasena_hash]
      );
      id_usuario = usuarioCreado.insertId;
    }

    const [trabajadorCreado] = await conexion.execute(
      `INSERT INTO trabajadores
       (id_usuario, id_area, id_cargo, id_turno_actual, id_jefe_trabajador, nombre_completo, dni, correo, telefono, url_foto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario,
        datos.id_area,
        datos.id_cargo,
        datos.id_turno_actual,
        datos.id_jefe_trabajador,
        datos.nombre_completo,
        datos.dni,
        datos.correo,
        datos.telefono,
        datos.url_foto
      ]
    );

    return { id_usuario, id_trabajador: trabajadorCreado.insertId };
  });

  await auditar(req, {
    accion: 'crear_trabajador',
    entidad: 'trabajadores',
    id_entidad: resultado.id_trabajador,
    datos_nuevos: { ...datos, contrasena: datos.contrasena ? '[oculta]' : undefined }
  });

  res.status(201).json({ ok: true, ...resultado });
}));

router.put('/:id_trabajador', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_trabajador = validarId(req.params.id_trabajador, 'Trabajador');
  const datos = normalizarTrabajador(req.body, false);

  await validarRelacionesTrabajador(datos, id_trabajador);

  const [antes] = await consultar(
    'SELECT * FROM trabajadores WHERE id_trabajador = :id_trabajador LIMIT 1',
    { id_trabajador }
  );

  if (!antes) {
    throw httpError(404, 'Trabajador no encontrado');
  }

  await consultar(
    `UPDATE trabajadores
     SET nombre_completo = :nombre_completo,
         dni = :dni,
         correo = :correo,
         telefono = :telefono,
         id_area = :id_area,
         id_cargo = :id_cargo,
         id_turno_actual = :id_turno_actual,
         id_jefe_trabajador = :id_jefe_trabajador,
         url_foto = :url_foto,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_trabajador = :id_trabajador
       AND eliminado_en IS NULL`,
    {
      id_trabajador,
      ...datos
    }
  );

  await auditar(req, {
    accion: 'actualizar_trabajador',
    entidad: 'trabajadores',
    id_entidad: id_trabajador,
    datos_anteriores: antes,
    datos_nuevos: datos
  });

  res.json({ ok: true, mensaje: 'Trabajador actualizado' });
}));

router.patch('/:id_trabajador/vincular-usuario', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_trabajador = validarId(req.params.id_trabajador, 'Trabajador');
  const id_usuario = idOpcional(req.body.id_usuario, 'Usuario');

  const [trabajador] = await consultar(
    'SELECT id_trabajador, id_usuario, id_area, nombre_completo FROM trabajadores WHERE id_trabajador = :id_trabajador AND eliminado_en IS NULL LIMIT 1',
    { id_trabajador }
  );

  if (!trabajador) {
    throw httpError(404, 'Trabajador no encontrado');
  }

  if (id_usuario) {
    const [usuario] = await consultar(
      `SELECT u.id_usuario, u.nombre_completo, u.estado, r.codigo AS rol
         FROM usuarios u
         INNER JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = :id_usuario
        LIMIT 1`,
      { id_usuario }
    );

    if (!usuario || usuario.estado !== 'activo') {
      throw httpError(400, 'Usuario no valido o inactivo');
    }

    const [vinculo] = await consultar(
      `SELECT id_trabajador, nombre_completo
         FROM trabajadores
        WHERE id_usuario = :id_usuario
          AND id_trabajador <> :id_trabajador
          AND eliminado_en IS NULL
        LIMIT 1`,
      { id_usuario, id_trabajador }
    );

    if (vinculo) {
      throw httpError(409, `Ese usuario ya esta vinculado a ${vinculo.nombre_completo}`);
    }
  }

  await consultar(
    `UPDATE trabajadores
        SET id_usuario = :id_usuario,
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id_trabajador = :id_trabajador`,
    { id_trabajador, id_usuario }
  );

  if (id_usuario) {
    await consultar(
      `UPDATE usuarios
          SET id_area = :id_area,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id_usuario = :id_usuario`,
      { id_usuario, id_area: trabajador.id_area }
    );
  }

  await auditar(req, {
    accion: 'vincular_usuario_trabajador',
    entidad: 'trabajadores',
    id_entidad: id_trabajador,
    datos_anteriores: { id_usuario: trabajador.id_usuario },
    datos_nuevos: { id_usuario }
  });

  res.json({ ok: true, mensaje: id_usuario ? 'Usuario vinculado al trabajador' : 'Usuario desvinculado del trabajador' });
}));

router.patch('/:id_trabajador/desactivar', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const [antes] = await consultar(
    'SELECT id_trabajador, nombre_completo, dni, activo, eliminado_en FROM trabajadores WHERE id_trabajador = :id_trabajador LIMIT 1',
    { id_trabajador: req.params.id_trabajador }
  );

  await consultar(
    `UPDATE trabajadores
     SET activo = false,
         desactivado_en = CURRENT_TIMESTAMP,
         eliminado_en = CURRENT_TIMESTAMP
     WHERE id_trabajador = :id_trabajador`,
    { id_trabajador: req.params.id_trabajador }
  );

  await auditar(req, {
    accion: 'desactivar_trabajador',
    entidad: 'trabajadores',
    id_entidad: req.params.id_trabajador,
    datos_anteriores: antes || null,
    datos_nuevos: { activo: false, eliminado_en: 'CURRENT_TIMESTAMP' }
  });

  res.json({ ok: true, mensaje: 'Trabajador desactivado sin borrar historial' });
}));

router.patch('/:id_trabajador/reactivar', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const [antes] = await consultar(
    'SELECT id_trabajador, nombre_completo, dni, activo, eliminado_en FROM trabajadores WHERE id_trabajador = :id_trabajador LIMIT 1',
    { id_trabajador: req.params.id_trabajador }
  );

  if (!antes) {
    throw httpError(404, 'Trabajador no encontrado');
  }

  await consultar(
    `UPDATE trabajadores
     SET activo = true,
         desactivado_en = NULL,
         eliminado_en = NULL,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_trabajador = :id_trabajador`,
    { id_trabajador: req.params.id_trabajador }
  );

  await auditar(req, {
    accion: 'reactivar_trabajador',
    entidad: 'trabajadores',
    id_entidad: req.params.id_trabajador,
    datos_anteriores: antes,
    datos_nuevos: { activo: true, desactivado_en: null, eliminado_en: null }
  });

  res.json({ ok: true, mensaje: 'Trabajador reactivado' });
}));

module.exports = router;

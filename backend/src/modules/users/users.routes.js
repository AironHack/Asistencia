const { Router } = require('express');
const bcrypt = require('bcryptjs');

const { consultar } = require('../../config/database');
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
  validarUsuario,
  validarContrasena,
  idOpcional
} = require('../../shared/validators');

const router = Router();

router.use(autenticar);

router.get('/', autorizarRoles('admin'), asyncHandler(async (_req, res) => {
  const usuarios = await consultar(
    `SELECT u.id_usuario, u.id_area, u.nombre_completo, u.usuario, u.correo, u.estado,
            r.codigo AS rol, a.nombre AS area
     FROM usuarios u
     INNER JOIN roles r ON r.id_rol = u.id_rol
     LEFT JOIN areas a ON a.id_area = u.id_area
     ORDER BY u.creado_en DESC`
  );

  res.json({ ok: true, usuarios });
}));

router.post('/', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const datos = {
    nombre_completo: limitarTexto(requerido(req.body.nombre_completo, 'Nombre'), 'Nombre', 160),
    usuario: validarUsuario(req.body.usuario),
    contrasena: validarContrasena(req.body.contrasena),
    correo: validarCorreo(req.body.correo),
    codigo_rol: requerido(req.body.codigo_rol, 'Rol'),
    id_area: idOpcional(req.body.id_area, 'Area')
  };

  const roles = await consultar('SELECT id_rol FROM roles WHERE codigo = :codigo_rol LIMIT 1', { codigo_rol: datos.codigo_rol });

  if (!roles.length) {
    throw httpError(400, 'Rol no valido');
  }

  if (datos.id_area) {
    const areas = await consultar('SELECT id_area FROM areas WHERE id_area = :id_area AND activo = true LIMIT 1', { id_area: datos.id_area });
    if (!areas.length) {
      throw httpError(400, 'Area no valida o inactiva');
    }
  }

  const contrasena_hash = await bcrypt.hash(datos.contrasena, env.bcryptRounds);

  const resultado = await consultar(
    `INSERT INTO usuarios (id_rol, id_area, nombre_completo, usuario, correo, contrasena_hash)
     VALUES (:id_rol, :id_area, :nombre_completo, :usuario, :correo, :contrasena_hash)`,
    {
      id_rol: roles[0].id_rol,
      id_area: datos.id_area,
      nombre_completo: datos.nombre_completo,
      usuario: datos.usuario,
      correo: datos.correo,
      contrasena_hash
    }
  );

  await auditar(req, {
    accion: 'crear_usuario',
    entidad: 'usuarios',
    id_entidad: resultado.insertId,
    datos_nuevos: { ...datos, contrasena: '[oculta]' }
  });

  res.status(201).json({ ok: true, id_usuario: resultado.insertId });
}));

router.put('/:id_usuario', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_usuario = Number(req.params.id_usuario);
  const datos = {
    nombre_completo: limitarTexto(requerido(req.body.nombre_completo, 'Nombre'), 'Nombre', 160),
    correo: validarCorreo(req.body.correo),
    codigo_rol: requerido(req.body.codigo_rol, 'Rol'),
    id_area: idOpcional(req.body.id_area, 'Area'),
    estado: req.body.estado || 'activo'
  };

  if (!['activo', 'inactivo'].includes(datos.estado)) {
    throw httpError(400, 'Estado no valido');
  }

  const roles = await consultar('SELECT id_rol FROM roles WHERE codigo = :codigo_rol LIMIT 1', { codigo_rol: datos.codigo_rol });

  if (!roles.length) {
    throw httpError(400, 'Rol no valido');
  }

  if (datos.id_area) {
    const areas = await consultar('SELECT id_area FROM areas WHERE id_area = :id_area AND activo = true LIMIT 1', { id_area: datos.id_area });
    if (!areas.length) {
      throw httpError(400, 'Area no valida o inactiva');
    }
  }

  const [antes] = await consultar(
    `SELECT u.id_usuario, u.nombre_completo, u.correo, u.id_area, u.estado, r.codigo AS rol
     FROM usuarios u
     INNER JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = :id_usuario
     LIMIT 1`,
    { id_usuario }
  );

  if (!antes) {
    throw httpError(404, 'Usuario no encontrado');
  }

  await consultar(
    `UPDATE usuarios
     SET nombre_completo = :nombre_completo,
         correo = :correo,
         id_rol = :id_rol,
         id_area = :id_area,
         estado = :estado,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_usuario = :id_usuario`,
    {
      id_usuario,
      nombre_completo: datos.nombre_completo,
      correo: datos.correo,
      id_rol: roles[0].id_rol,
      id_area: datos.id_area,
      estado: datos.estado
    }
  );

  await auditar(req, {
    accion: 'actualizar_usuario',
    entidad: 'usuarios',
    id_entidad: id_usuario,
    datos_anteriores: antes,
    datos_nuevos: datos
  });

  res.json({ ok: true, mensaje: 'Usuario actualizado' });
}));

router.patch('/:id_usuario/desactivar', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const [antes] = await consultar(
    'SELECT id_usuario, nombre_completo, usuario, estado FROM usuarios WHERE id_usuario = :id_usuario LIMIT 1',
    { id_usuario: req.params.id_usuario }
  );

  await consultar(
    `UPDATE usuarios
     SET estado = 'inactivo'
     WHERE id_usuario = :id_usuario`,
    { id_usuario: req.params.id_usuario }
  );

  await auditar(req, {
    accion: 'desactivar_usuario',
    entidad: 'usuarios',
    id_entidad: req.params.id_usuario,
    datos_anteriores: antes || null,
    datos_nuevos: { estado: 'inactivo' }
  });

  res.json({ ok: true, mensaje: 'Usuario desactivado' });
}));

router.patch('/:id_usuario/reactivar', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const [antes] = await consultar(
    'SELECT id_usuario, nombre_completo, usuario, estado FROM usuarios WHERE id_usuario = :id_usuario LIMIT 1',
    { id_usuario: req.params.id_usuario }
  );

  if (!antes) {
    throw httpError(404, 'Usuario no encontrado');
  }

  await consultar(
    `UPDATE usuarios
     SET estado = 'activo',
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_usuario = :id_usuario`,
    { id_usuario: req.params.id_usuario }
  );

  await auditar(req, {
    accion: 'reactivar_usuario',
    entidad: 'usuarios',
    id_entidad: req.params.id_usuario,
    datos_anteriores: antes,
    datos_nuevos: { estado: 'activo' }
  });

  res.json({ ok: true, mensaje: 'Usuario reactivado' });
}));

router.patch('/:id_usuario/contrasena', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const contrasena = validarContrasena(req.body.contrasena);

  const [antes] = await consultar(
    'SELECT id_usuario, nombre_completo, usuario, estado FROM usuarios WHERE id_usuario = :id_usuario LIMIT 1',
    { id_usuario: req.params.id_usuario }
  );

  if (!antes) {
    throw httpError(404, 'Usuario no encontrado');
  }

  const contrasena_hash = await bcrypt.hash(contrasena, env.bcryptRounds);

  await consultar(
    `UPDATE usuarios
     SET contrasena_hash = :contrasena_hash,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id_usuario = :id_usuario`,
    {
      id_usuario: req.params.id_usuario,
      contrasena_hash
    }
  );

  await auditar(req, {
    accion: 'cambiar_contrasena_usuario',
    entidad: 'usuarios',
    id_entidad: req.params.id_usuario,
    datos_anteriores: antes,
    datos_nuevos: { contrasena: '[actualizada]' }
  });

  res.json({ ok: true, mensaje: 'Contrasena actualizada' });
}));

module.exports = router;

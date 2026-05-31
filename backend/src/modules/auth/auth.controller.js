const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { env } = require('../../config/env');
const { consultar } = require('../../config/database');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');
const {
  estaBloqueado,
  segundosRestantes,
  registrarFallo,
  limpiarIntentos
} = require('./login-guard');

const login = async (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    throw httpError(400, 'Usuario y contrasena son obligatorios');
  }

  if (estaBloqueado(req, usuario)) {
    throw httpError(429, `Demasiados intentos. Intenta nuevamente en ${segundosRestantes(req, usuario)} segundos`);
  }

  const [user] = await consultar(
    `SELECT u.id_usuario, u.nombre_completo, u.usuario, u.correo, u.id_area, u.contrasena_hash, r.codigo as rol,
            t.id_trabajador
     FROM usuarios u 
     JOIN roles r ON u.id_rol = r.id_rol 
     LEFT JOIN trabajadores t ON t.id_usuario = u.id_usuario AND t.eliminado_en IS NULL
     WHERE u.usuario = :usuario AND u.estado = 'activo' LIMIT 1`,
    { usuario }
  );

  if (!user || !bcrypt.compareSync(contrasena, user.contrasena_hash)) {
    const intento = registrarFallo(req, usuario, env.login);

    if (user) {
      req.usuario = { id_usuario: user.id_usuario };
      await auditar(req, {
        accion: 'login_fallido',
        entidad: 'usuarios',
        id_entidad: user.id_usuario,
        datos_nuevos: { usuario: user.usuario, cantidad: intento.cantidad }
      });
    }

    throw httpError(401, 'Usuario o contrasena incorrectos');
  }

  limpiarIntentos(req, usuario);

  await consultar(
    'UPDATE usuarios SET ultimo_acceso_en = CURRENT_TIMESTAMP WHERE id_usuario = :id_usuario',
    { id_usuario: user.id_usuario }
  );

  req.usuario = { id_usuario: user.id_usuario };
  await auditar(req, {
    accion: 'login',
    entidad: 'usuarios',
    id_entidad: user.id_usuario,
    datos_nuevos: { usuario: user.usuario, rol: user.rol }
  });

  const accessToken = jwt.sign(
    { id_usuario: user.id_usuario, rol: user.rol },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
  const refreshToken = jwt.sign(
    { id_usuario: user.id_usuario, rol: user.rol },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );

  res.json({
    ok: true,
    accessToken,
    refreshToken,
    usuario: {
      id_usuario: user.id_usuario,
      nombre_completo: user.nombre_completo,
      usuario: user.usuario,
      correo: user.correo,
      id_area: user.id_area,
      rol: user.rol,
      id_trabajador: user.id_trabajador
    }
  });
};

const refresh = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw httpError(400, 'Refresh token obligatorio');
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    throw httpError(401, 'Sesion no valida');
  }

  const [user] = await consultar(
    `SELECT u.id_usuario, r.codigo AS rol
     FROM usuarios u
     INNER JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = :id_usuario AND u.estado = 'activo'
     LIMIT 1`,
    { id_usuario: payload.id_usuario }
  );

  if (!user) {
    throw httpError(401, 'Usuario inactivo o no encontrado');
  }

  const accessToken = jwt.sign(
    { id_usuario: user.id_usuario, rol: user.rol },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );

  res.json({ ok: true, accessToken });
};

const me = async (req, res) => {
  res.json({ ok: true, usuario: req.usuario });
};

const logout = async (req, res) => {
  await auditar(req, {
    accion: 'logout',
    entidad: 'usuarios',
    id_entidad: req.usuario.id_usuario,
    datos_nuevos: { usuario: req.usuario.usuario, rol: req.usuario.rol }
  });

  res.json({ ok: true, mensaje: 'Sesion cerrada' });
};

module.exports = { login, refresh, me, logout };

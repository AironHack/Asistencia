const { httpError } = require('./http-error');

function autorizarRoles(...rolesPermitidos) {
  return (req, _res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return next(httpError(403, 'No tienes permisos para esta accion'));
    }

    return next();
  };
}

module.exports = { autorizarRoles };
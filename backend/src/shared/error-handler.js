function errorHandler(error, _req, res, _next) {
  const esErrorSqlControlado = error.code === 'ER_SIGNAL_EXCEPTION' || error.sqlState === '45000';
  const esDuplicado = error.code === 'ER_DUP_ENTRY';
  const mensajeSql = mensajeErrorSql(error);
  const status = error.status || (esErrorSqlControlado || esDuplicado || mensajeSql ? 409 : 500);
  const message = status === 500
    ? 'Error interno del servidor'
    : (mensajeSql || error.sqlMessage || error.message);

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({
    ok: false,
    mensaje: message
  });
}

function mensajeErrorSql(error) {
  const mensaje = String(error.sqlMessage || '');

  if (error.code === 'ER_DATA_TOO_LONG' && mensaje.includes('token_jti')) {
    return 'El identificador del QR supera el tamano permitido. Ejecuta las migraciones de la base de datos';
  }

  if (error.code !== 'ER_DUP_ENTRY') return null;

  if (mensaje.includes('usuarios.usuario')) return 'El usuario ya existe';
  if (mensaje.includes('usuarios.correo')) return 'El correo ya esta registrado';
  if (mensaje.includes('trabajadores.dni')) return 'El DNI ya esta registrado';
  if (mensaje.includes('trabajadores.id_usuario')) return 'El usuario ya esta vinculado a un trabajador';
  if (mensaje.includes('areas.nombre')) return 'El area ya existe';
  if (mensaje.includes('cargos.uq_cargos_area_nombre')) return 'El cargo ya existe en esa area';
  if (mensaje.includes('turnos.nombre')) return 'El turno ya existe';
  if (mensaje.includes('registros_asistencia.uq_asistencia_trabajador_fecha_tipo')) {
    return 'Ya existe una marcacion de ese tipo para el trabajador en esa fecha';
  }

  return 'Registro duplicado';
}

module.exports = { errorHandler };

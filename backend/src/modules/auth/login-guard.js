const intentos = new Map();

function obtenerIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'ip_desconocida';
}

function claveIntento(req, usuario) {
  return `${obtenerIp(req)}:${String(usuario || '').toLowerCase()}`;
}

function leerIntento(req, usuario) {
  return intentos.get(claveIntento(req, usuario));
}

function estaBloqueado(req, usuario) {
  const intento = leerIntento(req, usuario);
  if (!intento?.bloqueadoHasta) return false;

  if (Date.now() >= intento.bloqueadoHasta) {
    intentos.delete(claveIntento(req, usuario));
    return false;
  }

  return true;
}

function segundosRestantes(req, usuario) {
  const intento = leerIntento(req, usuario);
  if (!intento?.bloqueadoHasta) return 0;
  return Math.max(1, Math.ceil((intento.bloqueadoHasta - Date.now()) / 1000));
}

function registrarFallo(req, usuario, config) {
  const clave = claveIntento(req, usuario);
  const ahora = Date.now();
  const actual = intentos.get(clave);
  const intento = actual && ahora - actual.primerFallo <= config.ventanaMs
    ? actual
    : { cantidad: 0, primerFallo: ahora, bloqueadoHasta: null };

  intento.cantidad += 1;

  if (intento.cantidad >= config.maxIntentos) {
    intento.bloqueadoHasta = ahora + config.bloqueoMs;
  }

  intentos.set(clave, intento);
  return intento;
}

function limpiarIntentos(req, usuario) {
  intentos.delete(claveIntento(req, usuario));
}

module.exports = {
  estaBloqueado,
  segundosRestantes,
  registrarFallo,
  limpiarIntentos,
  obtenerIp
};

const { httpError } = require('./http-error');

function texto(value) {
  return String(value ?? '').trim();
}

function requerido(value, campo) {
  const limpio = texto(value);
  if (!limpio) {
    throw httpError(400, `${campo} es obligatorio`);
  }
  return limpio;
}

function limitarTexto(value, campo, max) {
  const limpio = texto(value);
  if (limpio.length > max) {
    throw httpError(400, `${campo} no debe superar ${max} caracteres`);
  }
  return limpio;
}

function validarCorreo(value, campo = 'Correo') {
  const limpio = texto(value);
  if (!limpio) return null;

  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio);
  if (!valido || limpio.length > 160) {
    throw httpError(400, `${campo} no es valido`);
  }

  return limpio.toLowerCase();
}

function validarUrl(value, campo = 'URL') {
  const limpio = texto(value);
  if (!limpio) return null;

  if (/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(limpio)) {
    return limpio;
  }

  try {
    const url = new URL(limpio);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Protocolo no permitido');
    }
  } catch {
    throw httpError(400, `${campo} debe ser una URL http/https valida o una imagen capturada por camara`);
  }

  return limpio;
}

function validarFecha(value, campo = 'Fecha') {
  const limpio = requerido(value, campo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
    throw httpError(400, `${campo} debe tener formato YYYY-MM-DD`);
  }

  const fecha = new Date(`${limpio}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== limpio) {
    throw httpError(400, `${campo} no es valida`);
  }

  return limpio;
}

function validarFechaHora(value, campo = 'Fecha y hora') {
  const limpio = requerido(value, campo);
  const fecha = new Date(limpio);
  if (Number.isNaN(fecha.getTime())) {
    throw httpError(400, `${campo} no es valida`);
  }
  return limpio;
}

function validarHora(value, campo = 'Hora') {
  const limpio = requerido(value, campo);
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(limpio);
  if (!match) {
    throw httpError(400, `${campo} debe tener formato HH:mm o HH:mm:ss`);
  }
  return match[3] ? limpio : `${limpio}:00`;
}

function validarId(value, campo = 'ID') {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw httpError(400, `${campo} no es valido`);
  }
  return numero;
}

function idOpcional(value, campo = 'ID') {
  if (value === undefined || value === null || value === '') return null;
  return validarId(value, campo);
}

function validarEnteroRango(value, campo, min, max) {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < min || numero > max) {
    throw httpError(400, `${campo} debe estar entre ${min} y ${max}`);
  }
  return numero;
}

function validarDni(value) {
  const limpio = requerido(value, 'DNI').toUpperCase();
  if (!/^[A-Z0-9-]{6,20}$/.test(limpio)) {
    throw httpError(400, 'DNI debe tener entre 6 y 20 caracteres alfanumericos');
  }
  return limpio;
}

function validarUsuario(value) {
  const limpio = requerido(value, 'Usuario').toLowerCase();
  if (!/^[a-z0-9._-]{4,40}$/.test(limpio)) {
    throw httpError(400, 'Usuario debe tener 4 a 40 caracteres: letras, numeros, punto, guion o guion bajo');
  }
  return limpio;
}

function validarContrasena(value, campo = 'Contrasena') {
  const limpio = String(value ?? '');
  if (limpio.length < 6 || limpio.length > 72) {
    throw httpError(400, `${campo} debe tener entre 6 y 72 caracteres`);
  }
  return limpio;
}

function validarBooleano(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

module.exports = {
  texto,
  requerido,
  limitarTexto,
  validarCorreo,
  validarUrl,
  validarFecha,
  validarFechaHora,
  validarHora,
  validarId,
  idOpcional,
  validarEnteroRango,
  validarDni,
  validarUsuario,
  validarContrasena,
  validarBooleano
};

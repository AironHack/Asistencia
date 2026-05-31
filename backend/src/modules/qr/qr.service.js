const crypto = require('crypto');
const { env } = require('../../config/env');

function firmarPayload(payload) {
  return crypto
    .createHmac('sha256', env.qr.hmacSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function crearPayloadQr(id_trabajador) {
  const hash = crypto
    .createHash('sha256')
    .update(`fotocheck:${Number(id_trabajador)}:${env.qr.hmacSecret}`)
    .digest('hex')
    .slice(0, 32);

  return {
    tipo: 'fotocheck_permanente',
    version: 1,
    token_jti: `fc-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`,
    id_trabajador: Number(id_trabajador),
    emitido_en: 'permanente',
    expira_en: '2099-12-31T23:59:59.000Z'
  };
}

function crearQrFirmado(id_trabajador) {
  const payload = crearPayloadQr(id_trabajador);
  const firma = firmarPayload(payload);
  return { payload, firma, qr: { payload, firma } };
}

function validarQrFirmado(qr) {
  if (!qr || !qr.payload || !qr.firma) {
    return { valido: false, motivo: 'QR incompleto' };
  }

  if (!qr.payload.token_jti || !qr.payload.id_trabajador || !qr.payload.expira_en) {
    return { valido: false, motivo: 'Payload QR incompleto' };
  }

  const firmaEsperada = firmarPayload(qr.payload);

  if (firmaEsperada !== qr.firma) {
    return { valido: false, motivo: 'Firma QR invalida' };
  }

  if (qr.payload.tipo !== 'fotocheck_permanente' && new Date(qr.payload.expira_en).getTime() < Date.now()) {
    return { valido: false, motivo: 'QR expirado' };
  }

  return {
    valido: true,
    id_trabajador: qr.payload.id_trabajador,
    token_jti: qr.payload.token_jti
  };
}

module.exports = { crearQrFirmado, validarQrFirmado };

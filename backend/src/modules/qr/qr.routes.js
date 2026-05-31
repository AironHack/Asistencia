const { Router } = require('express');

const { consultar } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { crearQrFirmado } = require('./qr.service');

const router = Router();

router.use(autenticar);

router.get('/trabajador/:id_trabajador', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (req, res) => {
  const { id_trabajador } = req.params;

  if (req.usuario.rol !== 'admin' && Number(req.usuario.id_trabajador) !== Number(id_trabajador)) {
    throw httpError(403, 'Solo puedes generar tu propio QR');
  }

  const trabajadores = await consultar(
    `SELECT id_trabajador, activo
     FROM trabajadores
     WHERE id_trabajador = :id_trabajador AND eliminado_en IS NULL
     LIMIT 1`,
    { id_trabajador }
  );

  if (!trabajadores.length || !trabajadores[0].activo) {
    throw httpError(404, 'Trabajador no encontrado o inactivo');
  }

  const { payload, firma, qr } = crearQrFirmado(id_trabajador);

  await consultar(
    `INSERT INTO tokens_qr (id_trabajador, token_jti, payload, firma, expira_en, ultima_sincronizacion_en)
     VALUES (:id_trabajador, :token_jti, CAST(:payload AS JSON), :firma, :expira_en, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       payload = VALUES(payload),
       firma = VALUES(firma),
       estado = 'activo',
       expira_en = VALUES(expira_en),
       ultima_sincronizacion_en = CURRENT_TIMESTAMP`,
    {
      id_trabajador,
      token_jti: payload.token_jti,
      payload: JSON.stringify(payload),
      firma,
      expira_en: payload.expira_en.slice(0, 19).replace('T', ' ')
    }
  );

  res.json({ ok: true, qr });
}));

module.exports = router;

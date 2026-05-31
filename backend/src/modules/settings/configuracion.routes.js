const { Router } = require('express');

const { consultar } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');

const router = Router();

router.use(autenticar);

router.get('/publica', autorizarRoles('admin', 'supervisor', 'vigilante', 'trabajador'), asyncHandler(async (_req, res) => {
  const configuraciones = await consultar(
    `SELECT clave, valor, descripcion
       FROM configuraciones
      WHERE clave IN ('nombre_empresa', 'logo_empresa_url', 'eslogan_empresa', 'zona_horaria')
      ORDER BY clave`
  );

  res.json({ ok: true, configuraciones });
}));

router.get('/', autorizarRoles('admin'), asyncHandler(async (_req, res) => {
  const configuraciones = await consultar(
    'SELECT clave, valor, descripcion FROM configuraciones ORDER BY clave'
  );

  res.json({ ok: true, configuraciones });
}));

router.put('/:clave', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const { valor, descripcion } = req.body;

  if (valor === undefined) {
    throw httpError(400, 'Valor obligatorio');
  }

  const [antes] = await consultar(
    'SELECT clave, valor, descripcion FROM configuraciones WHERE clave = :clave LIMIT 1',
    { clave: req.params.clave }
  );

  await consultar(
    `INSERT INTO configuraciones (clave, valor, descripcion)
     VALUES (:clave, CAST(:valor AS JSON), :descripcion)
     ON DUPLICATE KEY UPDATE
       valor = VALUES(valor),
       descripcion = VALUES(descripcion),
       actualizado_en = CURRENT_TIMESTAMP`,
    {
      clave: req.params.clave,
      valor: JSON.stringify(valor),
      descripcion: descripcion || null
    }
  );

  await auditar(req, {
    accion: 'guardar_configuracion',
    entidad: 'configuraciones',
    id_entidad: null,
    datos_anteriores: antes || null,
    datos_nuevos: { clave: req.params.clave, valor, descripcion: descripcion || null }
  });

  res.json({ ok: true, mensaje: 'Configuracion guardada' });
}));

module.exports = router;

const crypto = require('crypto');
const { Router } = require('express');

const { consultar, transaccion } = require('../../config/database');
const { asyncHandler } = require('../../shared/async-handler');
const { autenticar } = require('../../shared/auth.middleware');
const { autorizarRoles } = require('../../shared/roles.middleware');
const { httpError } = require('../../shared/http-error');
const { auditar } = require('../../shared/audit');
const { validarId, validarUrl } = require('../../shared/validators');

const router = Router();
const MODELO = 'visual-hash-v2';

router.use(autenticar);

function descriptorValido(descriptor) {
  return Array.isArray(descriptor)
    && descriptor.length >= 16
    && descriptor.length <= 1024
    && descriptor.every((valor) => Number.isFinite(Number(valor)) && Number(valor) >= 0 && Number(valor) <= 1);
}

function normalizarDescriptor(descriptor) {
  if (!descriptorValido(descriptor)) {
    throw httpError(400, 'Plantilla facial no valida');
  }
  return descriptor.map((valor) => Number(valor));
}

function hashDescriptor(descriptor) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(descriptor))
    .digest('hex');
}

function similitud(a, b) {
  const largo = Math.min(a.length, b.length);
  if (!largo) return 0;

  let suma = 0;
  for (let i = 0; i < largo; i += 1) {
    const diferencia = Number(a[i]) - Number(b[i]);
    suma += diferencia * diferencia;
  }

  const distancia = Math.sqrt(suma / largo);
  const penalizacionModeloAnterior = a.length === b.length ? 0 : Math.abs(a.length - b.length) / Math.max(a.length, b.length) * 0.15;
  return Math.max(0, Math.min(1, 1 - distancia - penalizacionModeloAnterior));
}

async function obtenerConfianzaMinima() {
  const [config] = await consultar(
    "SELECT JSON_UNQUOTE(valor) AS valor FROM configuraciones WHERE clave = 'confianza_facial_minima' LIMIT 1"
  );

  const valor = Number(config?.valor ?? 0.85);
  return Number.isFinite(valor) ? valor : 0.85;
}

router.get('/plantillas', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const filtros = [];
  const params = {};

  if (req.query.id_trabajador) {
    filtros.push('pf.id_trabajador = :id_trabajador');
    params.id_trabajador = validarId(req.query.id_trabajador, 'Trabajador');
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const plantillas = await consultar(
    `SELECT pf.id_plantilla_facial, pf.id_trabajador, pf.modelo, pf.activo, pf.creado_en,
            t.nombre_completo AS trabajador, t.dni
       FROM plantillas_faciales pf
       INNER JOIN trabajadores t ON t.id_trabajador = pf.id_trabajador
       ${where}
      ORDER BY pf.creado_en DESC
      LIMIT 100`,
    params
  );

  res.json({ ok: true, plantillas });
}));

router.post('/plantillas', autorizarRoles('admin'), asyncHandler(async (req, res) => {
  const id_trabajador = validarId(req.body.id_trabajador, 'Trabajador');
  const descriptor = normalizarDescriptor(req.body.descriptor);
  const foto = validarUrl(req.body.foto, 'Foto');

  const trabajadores = await consultar(
    'SELECT id_trabajador, nombre_completo, dni FROM trabajadores WHERE id_trabajador = :id_trabajador AND activo = true AND eliminado_en IS NULL LIMIT 1',
    { id_trabajador }
  );

  if (!trabajadores.length) {
    throw httpError(400, 'Trabajador no valido o inactivo');
  }

  const payload = Buffer.from(JSON.stringify({ descriptor }), 'utf8');
  const hash = hashDescriptor(descriptor);

  const resultado = await transaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE plantillas_faciales
          SET activo = false
        WHERE id_trabajador = :id_trabajador
          AND activo = true`,
      { id_trabajador }
    );

    const [plantillaCreada] = await conexion.execute(
      `INSERT INTO plantillas_faciales
         (id_trabajador, hash_plantilla, datos_biometricos, modelo, activo)
       VALUES
         (:id_trabajador, :hash_plantilla, :datos_biometricos, :modelo, true)`,
      {
        id_trabajador,
        hash_plantilla: hash,
        datos_biometricos: payload,
        modelo: MODELO
      }
    );

    let id_foto = null;
    if (foto) {
      await conexion.execute(
        `UPDATE fotos_trabajador
            SET es_principal = false
          WHERE id_trabajador = :id_trabajador
            AND es_principal = true`,
        { id_trabajador }
      );

      const [fotoCreada] = await conexion.execute(
        `INSERT INTO fotos_trabajador
           (id_trabajador, url_imagen, es_principal)
         VALUES
           (:id_trabajador, :url_imagen, true)`,
        { id_trabajador, url_imagen: foto }
      );

      id_foto = fotoCreada.insertId;

      await conexion.execute(
        `UPDATE trabajadores
            SET url_foto = :foto,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id_trabajador = :id_trabajador`,
        { id_trabajador, foto }
      );
    }

    return { id_plantilla_facial: plantillaCreada.insertId, id_foto };
  });

  await auditar(req, {
    accion: 'crear_plantilla_facial',
    entidad: 'plantillas_faciales',
    id_entidad: resultado.id_plantilla_facial,
    datos_nuevos: { id_trabajador, modelo: MODELO, hash_plantilla: hash, id_foto: resultado.id_foto }
  });

  res.status(201).json({
    ok: true,
    ...resultado,
    trabajador: trabajadores[0]
  });
}));

router.post('/buscar', autorizarRoles('admin', 'vigilante'), asyncHandler(async (req, res) => {
  const descriptor = normalizarDescriptor(req.body.descriptor);
  const confianzaMinima = Number(req.body.confianza_minima || await obtenerConfianzaMinima());

  const plantillas = await consultar(
    `SELECT pf.id_plantilla_facial, pf.id_trabajador, pf.datos_biometricos, pf.modelo,
            t.nombre_completo, t.dni, COALESCE(fp.url_imagen, t.url_foto) AS url_foto, a.nombre AS area, c.nombre AS cargo
       FROM plantillas_faciales pf
       INNER JOIN trabajadores t ON t.id_trabajador = pf.id_trabajador
       INNER JOIN areas a ON a.id_area = t.id_area
       LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
       LEFT JOIN fotos_trabajador fp ON fp.id_trabajador = t.id_trabajador AND fp.es_principal = true
      WHERE pf.activo = true
        AND t.activo = true
        AND t.eliminado_en IS NULL`
  );

  const candidatos = plantillas
    .map((plantilla) => {
      const guardado = JSON.parse(Buffer.from(plantilla.datos_biometricos).toString('utf8'));
      return {
        id_plantilla_facial: plantilla.id_plantilla_facial,
        id_trabajador: plantilla.id_trabajador,
        nombre_completo: plantilla.nombre_completo,
        dni: plantilla.dni,
        area: plantilla.area,
        cargo: plantilla.cargo,
        url_foto: plantilla.url_foto,
        modelo: plantilla.modelo,
        confianza: Number(similitud(descriptor, guardado.descriptor).toFixed(4))
      };
    })
    .filter((candidato) => candidato.confianza >= confianzaMinima)
    .sort((a, b) => b.confianza - a.confianza)
    .slice(0, 5);

  await consultar(
    `INSERT INTO intentos_reconocimiento_facial
       (id_trabajador_propuesto, confianza, confirmado, informacion_dispositivo)
     VALUES
       (:id_trabajador, :confianza, false, CAST(:informacion AS JSON))`,
    {
      id_trabajador: candidatos[0]?.id_trabajador || null,
      confianza: candidatos[0]?.confianza || 0,
      informacion: JSON.stringify({ origen_web: true, candidatos: candidatos.length })
    }
  );

  res.json({ ok: true, confianza_minima: confianzaMinima, candidatos });
}));

module.exports = router;

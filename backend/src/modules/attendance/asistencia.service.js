const { consultar } = require('../../config/database');
const { env } = require('../../config/env');
const { httpError } = require('../../shared/http-error');

async function obtenerTrabajadorActivo(id_trabajador) {
  const filas = await consultar(
    `SELECT t.id_trabajador, t.id_area, t.nombre_completo, t.dni, COALESCE(fp.url_imagen, t.url_foto) AS url_foto, t.id_turno_actual,
            a.nombre AS area, c.nombre AS cargo, tu.hora_entrada, tu.hora_salida, tu.minutos_tolerancia
     FROM trabajadores t
     INNER JOIN areas a ON a.id_area = t.id_area
     LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
     LEFT JOIN turnos tu ON tu.id_turno = t.id_turno_actual
     LEFT JOIN fotos_trabajador fp ON fp.id_trabajador = t.id_trabajador AND fp.es_principal = true
     WHERE t.id_trabajador = :id_trabajador
       AND t.activo = true
       AND t.eliminado_en IS NULL
     LIMIT 1`,
    { id_trabajador }
  );

  if (!filas.length) {
    throw httpError(404, 'Trabajador no encontrado o inactivo');
  }

  return filas[0];
}

function fechaMysql(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.zonaHoraria || 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha);

  const valor = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valor.year}-${valor.month}-${valor.day}`;
}

function partesFechaHoraLocal(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.zonaHoraria || 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(fecha);

  const valor = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return {
    fecha: `${valor.year}-${valor.month}-${valor.day}`,
    hora: Number(valor.hour === '24' ? 0 : valor.hour),
    minuto: Number(valor.minute),
    segundo: Number(valor.second)
  };
}

function fechaHoraMysql(fecha = new Date()) {
  return fecha.toISOString().slice(0, 19).replace('T', ' ');
}

function calcularEstadoEntrada(trabajador, fechaActual) {
  if (!trabajador.hora_entrada) {
    return { estado: 'puntual', minutos_tardanza: 0 };
  }

  const local = partesFechaHoraLocal(fechaActual);
  const [horaEntrada, minutoEntrada] = String(trabajador.hora_entrada).split(':').map(Number);
  const minutoMarcacion = (local.hora * 60) + local.minuto + (local.segundo > 0 ? 1 : 0);
  const minutoLimite = (horaEntrada * 60) + minutoEntrada + Number(trabajador.minutos_tolerancia || 0);
  const minutos_tardanza = Math.max(0, minutoMarcacion - minutoLimite);

  return {
    estado: minutos_tardanza > 0 ? 'tardanza' : 'puntual',
    minutos_tardanza
  };
}

async function decidirTipoMarcacion(id_trabajador, fecha_asistencia) {
  const marcas = await consultar(
    `SELECT tipo_marcacion
     FROM registros_asistencia
     WHERE id_trabajador = :id_trabajador
       AND fecha_asistencia = :fecha_asistencia`,
    { id_trabajador, fecha_asistencia }
  );

  const tieneEntrada = marcas.some((marca) => marca.tipo_marcacion === 'entrada');
  const tieneSalida = marcas.some((marca) => marca.tipo_marcacion === 'salida');

  if (!tieneEntrada) return 'entrada';
  if (!tieneSalida) return 'salida';

  throw httpError(409, 'El trabajador ya tiene entrada y salida registradas hoy');
}

async function registrarAsistencia({ id_trabajador, origen, registrado_por_usuario, informacion_dispositivo = {} }) {
  const trabajador = await obtenerTrabajadorActivo(id_trabajador);
  const ahora = new Date();
  const fecha_asistencia = fechaMysql(ahora);
  const marcado_en = fechaHoraMysql(ahora);
  const tipo_marcacion = await decidirTipoMarcacion(id_trabajador, fecha_asistencia);

  const datosEstado = tipo_marcacion === 'entrada'
    ? calcularEstadoEntrada(trabajador, ahora)
    : { estado: 'puntual', minutos_tardanza: 0 };

  let resultado;

  try {
    resultado = await consultar(
      `INSERT INTO registros_asistencia
       (id_trabajador, id_turno, fecha_asistencia, tipo_marcacion, marcado_en, origen, estado,
        minutos_tardanza, registrado_por_usuario, informacion_dispositivo)
       VALUES
       (:id_trabajador, :id_turno, :fecha_asistencia, :tipo_marcacion, :marcado_en, :origen, :estado,
        :minutos_tardanza, :registrado_por_usuario, CAST(:informacion_dispositivo AS JSON))`,
      {
        id_trabajador,
        id_turno: trabajador.id_turno_actual || null,
        fecha_asistencia,
        tipo_marcacion,
        marcado_en,
        origen,
        estado: tipo_marcacion === 'salida' ? 'puntual' : datosEstado.estado,
        minutos_tardanza: datosEstado.minutos_tardanza,
        registrado_por_usuario,
        informacion_dispositivo: JSON.stringify(informacion_dispositivo)
      }
    );
  } catch (error) {
    if (error.code === 'ER_SIGNAL_EXCEPTION' || error.sqlState === '45000') {
      throw httpError(409, error.sqlMessage || error.message || 'Marcacion duplicada');
    }

    throw error;
  }

  return {
    id_asistencia: resultado.insertId,
    tipo_marcacion,
    trabajador,
    fecha_asistencia,
    marcado_en,
    origen,
    estado: tipo_marcacion === 'salida' ? 'puntual' : datosEstado.estado,
    minutos_tardanza: datosEstado.minutos_tardanza
  };
}

module.exports = { registrarAsistencia, obtenerTrabajadorActivo, fechaMysql };

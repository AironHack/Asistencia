USE asistencia_db;

-- Las marcaciones se guardan como instante UTC en marcado_en, pero fecha_asistencia
-- debe representar el dia laboral local de Peru.
UPDATE registros_asistencia
SET fecha_asistencia = DATE(DATE_SUB(marcado_en, INTERVAL 5 HOUR))
WHERE fecha_asistencia <> DATE(DATE_SUB(marcado_en, INTERVAL 5 HOUR))
  AND NOT EXISTS (
    SELECT 1
    FROM (
      SELECT id_trabajador, fecha_asistencia, tipo_marcacion
      FROM registros_asistencia
    ) AS existente
    WHERE existente.id_trabajador = registros_asistencia.id_trabajador
      AND existente.fecha_asistencia = DATE(DATE_SUB(registros_asistencia.marcado_en, INTERVAL 5 HOUR))
      AND existente.tipo_marcacion = registros_asistencia.tipo_marcacion
  );

CREATE OR REPLACE VIEW vista_asistencias_hoy AS
SELECT
  t.id_trabajador,
  t.nombre_completo,
  t.dni,
  a.nombre AS area,
  c.nombre AS cargo,
  tu.nombre AS turno,
  entrada.marcado_en AS hora_entrada,
  salida.marcado_en AS hora_salida,
  COALESCE(entrada.estado, 'ausente') AS estado,
  COALESCE(entrada.minutos_tardanza, 0) AS minutos_tardanza
FROM trabajadores t
INNER JOIN areas a ON a.id_area = t.id_area
LEFT JOIN cargos c ON c.id_cargo = t.id_cargo
LEFT JOIN turnos tu ON tu.id_turno = t.id_turno_actual
LEFT JOIN registros_asistencia entrada
  ON entrada.id_trabajador = t.id_trabajador
 AND entrada.fecha_asistencia = DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
 AND entrada.tipo_marcacion = 'entrada'
LEFT JOIN registros_asistencia salida
  ON salida.id_trabajador = t.id_trabajador
 AND salida.fecha_asistencia = DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
 AND salida.tipo_marcacion = 'salida'
WHERE t.activo = true
  AND t.eliminado_en IS NULL;

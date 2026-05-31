USE asistencia_db;

INSERT INTO roles (codigo, nombre, descripcion) VALUES
  ('admin', 'Administrador', 'Acceso total al sistema'),
  ('supervisor', 'Supervisor', 'Reportes de su area, solicitudes y horas extras'),
  ('vigilante', 'Vigilante', 'Registro de asistencia por QR o facial'),
  ('trabajador', 'Trabajador', 'Consulta personal y solicitudes')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion);

INSERT INTO tipos_solicitud (codigo, nombre) VALUES
  ('justificacion_tardanza', 'Justificacion de tardanza'),
  ('justificacion_ausencia', 'Justificacion de ausencia'),
  ('horas_extra', 'Horas extras')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre);

INSERT INTO areas (nombre) VALUES
  ('Administracion'),
  ('Operaciones'),
  ('Seguridad'),
  ('Recursos Humanos')
ON DUPLICATE KEY UPDATE
  activo = true;

INSERT INTO cargos (id_area, nombre)
SELECT id_area, 'Administrador del sistema'
FROM areas
WHERE nombre = 'Administracion'
ON DUPLICATE KEY UPDATE
  activo = true;

INSERT INTO cargos (id_area, nombre)
SELECT id_area, 'Supervisor de operaciones'
FROM areas
WHERE nombre = 'Operaciones'
ON DUPLICATE KEY UPDATE
  activo = true;

INSERT INTO cargos (id_area, nombre)
SELECT id_area, 'Vigilante'
FROM areas
WHERE nombre = 'Seguridad'
ON DUPLICATE KEY UPDATE
  activo = true;

INSERT INTO cargos (id_area, nombre)
SELECT id_area, 'Analista de recursos humanos'
FROM areas
WHERE nombre = 'Recursos Humanos'
ON DUPLICATE KEY UPDATE
  activo = true;

INSERT INTO turnos (nombre, hora_entrada, hora_salida, minutos_tolerancia) VALUES
  ('Turno administrativo', '08:00:00', '17:00:00', 10)
ON DUPLICATE KEY UPDATE
  hora_entrada = VALUES(hora_entrada),
  hora_salida = VALUES(hora_salida),
  minutos_tolerancia = VALUES(minutos_tolerancia),
  activo = true;

INSERT INTO usuarios (id_rol, id_area, nombre_completo, usuario, correo, contrasena_hash)
SELECT r.id_rol, a.id_area, 'Administrador Principal', 'admin', 'admin@empresa.local',
       '$2a$12$DokB9DiwT51nbhFtxfG5aOiCQaI0wtI02GUn.4NJtd2OE9.W.y.8K'
FROM roles r
INNER JOIN areas a ON a.nombre = 'Administracion'
WHERE r.codigo = 'admin'
ON DUPLICATE KEY UPDATE
  nombre_completo = VALUES(nombre_completo),
  correo = VALUES(correo),
  contrasena_hash = VALUES(contrasena_hash),
  estado = 'activo';

INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('nombre_empresa', '"Mi Empresa"', 'Nombre visible de la empresa'),
  ('logo_empresa_url', '""', 'URL del logo de la empresa'),
  ('eslogan_empresa', '"SOMOS FUTURO"', 'Eslogan del fotocheck digital'),
  ('zona_horaria', '"America/Lima"', 'Zona horaria del sistema'),
  ('tolerancia_global_minutos', '10', 'Tolerancia global sugerida en minutos'),
  ('reconocimiento_facial_activo', 'true', 'Activa o desactiva reconocimiento facial'),
  ('confianza_facial_minima', '0.85', 'Confianza minima facial recomendada'),
  ('umbral_minutos_tardanza_alerta', '60', 'Tardanza acumulada para alertas'),
  ('qr_fotocheck_requiere_facial', 'false', 'Permite registrar asistencia con fotocheck QR permanente sin verificacion facial adicional')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion),
  actualizado_en = CURRENT_TIMESTAMP;

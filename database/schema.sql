CREATE DATABASE IF NOT EXISTS asistencia_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE asistencia_db;

CREATE TABLE roles (
  id_rol bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  codigo varchar(30) NOT NULL UNIQUE,
  nombre varchar(80) NOT NULL,
  descripcion text,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE areas (
  id_area bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  nombre varchar(120) NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE cargos (
  id_cargo bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_area bigint unsigned,
  nombre varchar(120) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cargos_area_nombre (id_area, nombre),
  CONSTRAINT fk_cargos_area FOREIGN KEY (id_area) REFERENCES areas(id_area)
) ENGINE=InnoDB;

CREATE TABLE turnos (
  id_turno bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  nombre varchar(120) NOT NULL UNIQUE,
  hora_entrada time NOT NULL,
  hora_salida time NOT NULL,
  minutos_tolerancia int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (minutos_tolerancia >= 0)
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id_usuario bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_rol bigint unsigned NOT NULL,
  id_area bigint unsigned,
  nombre_completo varchar(160) NOT NULL,
  usuario varchar(80) NOT NULL UNIQUE,
  correo varchar(160) UNIQUE,
  contrasena_hash text NOT NULL,
  estado enum('activo', 'inactivo') NOT NULL DEFAULT 'activo',
  ultimo_acceso_en timestamp NULL,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (id_rol) REFERENCES roles(id_rol),
  CONSTRAINT fk_usuarios_area FOREIGN KEY (id_area) REFERENCES areas(id_area)
) ENGINE=InnoDB;

CREATE TABLE trabajadores (
  id_trabajador bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_usuario bigint unsigned UNIQUE,
  id_area bigint unsigned NOT NULL,
  id_cargo bigint unsigned,
  id_turno_actual bigint unsigned,
  id_jefe_trabajador bigint unsigned,
  nombre_completo varchar(160) NOT NULL,
  dni varchar(20) NOT NULL UNIQUE,
  correo varchar(160),
  telefono varchar(40),
  url_foto mediumtext,
  fecha_ingreso date,
  activo boolean NOT NULL DEFAULT true,
  desactivado_en timestamp NULL,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminado_en timestamp NULL,
  CONSTRAINT fk_trabajadores_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
  CONSTRAINT fk_trabajadores_area FOREIGN KEY (id_area) REFERENCES areas(id_area),
  CONSTRAINT fk_trabajadores_cargo FOREIGN KEY (id_cargo) REFERENCES cargos(id_cargo),
  CONSTRAINT fk_trabajadores_turno FOREIGN KEY (id_turno_actual) REFERENCES turnos(id_turno),
  CONSTRAINT fk_trabajadores_jefe FOREIGN KEY (id_jefe_trabajador) REFERENCES trabajadores(id_trabajador),
  CHECK ((activo = true AND eliminado_en IS NULL) OR activo = false)
) ENGINE=InnoDB;

CREATE TABLE fotos_trabajador (
  id_foto bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned NOT NULL,
  url_imagen mediumtext NOT NULL,
  es_principal boolean NOT NULL DEFAULT false,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fotos_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador)
) ENGINE=InnoDB;

CREATE TABLE plantillas_faciales (
  id_plantilla_facial bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned NOT NULL,
  hash_plantilla text NOT NULL,
  datos_biometricos longblob NOT NULL,
  modelo varchar(80) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_plantillas_faciales_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador)
) ENGINE=InnoDB;

CREATE TABLE asignaciones_turno (
  id_asignacion_turno bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned NOT NULL,
  id_turno bigint unsigned NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  asignado_por_usuario bigint unsigned,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_asignaciones_turno_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
  CONSTRAINT fk_asignaciones_turno_turno FOREIGN KEY (id_turno) REFERENCES turnos(id_turno),
  CONSTRAINT fk_asignaciones_turno_usuario FOREIGN KEY (asignado_por_usuario) REFERENCES usuarios(id_usuario),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

CREATE TABLE registros_asistencia (
  id_asistencia bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned NOT NULL,
  id_turno bigint unsigned,
  fecha_asistencia date NOT NULL,
  tipo_marcacion enum('entrada', 'salida') NOT NULL,
  marcado_en timestamp NOT NULL,
  origen enum('qr', 'facial', 'manual') NOT NULL,
  estado enum('puntual', 'tardanza', 'ausente', 'justificado', 'pendiente_salida') NOT NULL,
  minutos_tardanza int NOT NULL DEFAULT 0,
  registrado_por_usuario bigint unsigned,
  informacion_dispositivo json NOT NULL,
  observacion text,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asistencia_trabajador_fecha_tipo (id_trabajador, fecha_asistencia, tipo_marcacion),
  CONSTRAINT fk_asistencia_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
  CONSTRAINT fk_asistencia_turno FOREIGN KEY (id_turno) REFERENCES turnos(id_turno),
  CONSTRAINT fk_asistencia_usuario_registro FOREIGN KEY (registrado_por_usuario) REFERENCES usuarios(id_usuario),
  CHECK (minutos_tardanza >= 0)
) ENGINE=InnoDB;

CREATE TABLE intentos_asistencia (
  id_intento_asistencia bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned,
  intentado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origen enum('qr', 'facial', 'manual') NOT NULL,
  aceptado boolean NOT NULL,
  motivo_rechazo varchar(160),
  hash_payload text,
  registrado_por_usuario bigint unsigned,
  informacion_dispositivo json NOT NULL,
  CONSTRAINT fk_intentos_asistencia_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
  CONSTRAINT fk_intentos_asistencia_usuario FOREIGN KEY (registrado_por_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE intentos_reconocimiento_facial (
  id_intento_facial bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador_propuesto bigint unsigned,
  confianza decimal(5,4) NOT NULL,
  confirmado boolean NOT NULL DEFAULT false,
  confirmado_por_usuario bigint unsigned,
  confirmado_en timestamp NULL,
  motivo_rechazo varchar(160),
  informacion_dispositivo json NOT NULL,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_intentos_faciales_trabajador FOREIGN KEY (id_trabajador_propuesto) REFERENCES trabajadores(id_trabajador),
  CONSTRAINT fk_intentos_faciales_usuario FOREIGN KEY (confirmado_por_usuario) REFERENCES usuarios(id_usuario),
  CHECK (confianza >= 0 AND confianza <= 1),
  CHECK (
    (confirmado = true AND confirmado_por_usuario IS NOT NULL AND confirmado_en IS NOT NULL)
    OR confirmado = false
  )
) ENGINE=InnoDB;

CREATE TABLE tokens_qr (
  id_token_qr bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned NOT NULL,
  token_jti varchar(64) NOT NULL UNIQUE,
  payload json NOT NULL,
  firma text NOT NULL,
  estado enum('activo', 'revocado', 'expirado') NOT NULL DEFAULT 'activo',
  emitido_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en datetime NOT NULL,
  revocado_en timestamp NULL,
  ultima_sincronizacion_en timestamp NULL,
  CONSTRAINT fk_tokens_qr_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador)
) ENGINE=InnoDB;

CREATE TABLE tipos_solicitud (
  id_tipo_solicitud bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  codigo varchar(40) NOT NULL UNIQUE,
  nombre varchar(120) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE solicitudes_trabajador (
  id_solicitud bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_trabajador bigint unsigned NOT NULL,
  id_tipo_solicitud bigint unsigned NOT NULL,
  id_asistencia bigint unsigned,
  fecha_solicitud date NOT NULL,
  motivo text NOT NULL,
  url_adjunto text,
  estado enum('pendiente', 'aprobada', 'rechazada') NOT NULL DEFAULT 'pendiente',
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_solicitudes_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
  CONSTRAINT fk_solicitudes_tipo FOREIGN KEY (id_tipo_solicitud) REFERENCES tipos_solicitud(id_tipo_solicitud),
  CONSTRAINT fk_solicitudes_asistencia FOREIGN KEY (id_asistencia) REFERENCES registros_asistencia(id_asistencia)
) ENGINE=InnoDB;

CREATE TABLE aprobaciones_solicitud (
  id_aprobacion bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_solicitud bigint unsigned NOT NULL UNIQUE,
  decidido_por_usuario bigint unsigned NOT NULL,
  decision enum('aprobada', 'rechazada') NOT NULL,
  comentario text NOT NULL,
  decidido_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aprobaciones_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_trabajador(id_solicitud),
  CONSTRAINT fk_aprobaciones_usuario FOREIGN KEY (decidido_por_usuario) REFERENCES usuarios(id_usuario),
  CHECK (length(trim(comentario)) > 0)
) ENGINE=InnoDB;

CREATE TABLE horas_extra (
  id_hora_extra bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_solicitud bigint unsigned NOT NULL UNIQUE,
  id_trabajador bigint unsigned NOT NULL,
  fecha_hora_extra date NOT NULL,
  minutos_aprobados int NOT NULL,
  aprobado_por_usuario bigint unsigned NOT NULL,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_horas_extra_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_trabajador(id_solicitud),
  CONSTRAINT fk_horas_extra_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
  CONSTRAINT fk_horas_extra_usuario FOREIGN KEY (aprobado_por_usuario) REFERENCES usuarios(id_usuario),
  CHECK (minutos_aprobados > 0)
) ENGINE=InnoDB;

CREATE TABLE configuraciones (
  id_configuracion bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  clave varchar(80) NOT NULL UNIQUE,
  valor json NOT NULL,
  descripcion text,
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE auditoria (
  id_auditoria bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  id_usuario bigint unsigned,
  accion varchar(120) NOT NULL,
  entidad varchar(120) NOT NULL,
  id_entidad bigint unsigned,
  datos_anteriores json,
  datos_nuevos json,
  ip varchar(45),
  creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE INDEX idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX idx_usuarios_area ON usuarios(id_area);
CREATE INDEX idx_trabajadores_area ON trabajadores(id_area);
CREATE INDEX idx_trabajadores_cargo ON trabajadores(id_cargo);
CREATE INDEX idx_trabajadores_turno ON trabajadores(id_turno_actual);
CREATE INDEX idx_asignaciones_turno_fechas ON asignaciones_turno(id_trabajador, fecha_inicio, fecha_fin);
CREATE INDEX idx_asistencia_trabajador_fecha ON registros_asistencia(id_trabajador, fecha_asistencia);
CREATE INDEX idx_asistencia_fecha_estado ON registros_asistencia(fecha_asistencia, estado);
CREATE INDEX idx_asistencia_origen ON registros_asistencia(origen);
CREATE INDEX idx_intentos_asistencia_trabajador_fecha ON intentos_asistencia(id_trabajador, intentado_en);
CREATE INDEX idx_intentos_faciales_trabajador_fecha ON intentos_reconocimiento_facial(id_trabajador_propuesto, creado_en);
CREATE INDEX idx_tokens_qr_trabajador_estado ON tokens_qr(id_trabajador, estado);
CREATE INDEX idx_tokens_qr_expira_en ON tokens_qr(expira_en);
CREATE INDEX idx_solicitudes_trabajador_estado ON solicitudes_trabajador(id_trabajador, estado);
CREATE INDEX idx_solicitudes_fecha ON solicitudes_trabajador(fecha_solicitud);
CREATE INDEX idx_auditoria_creado_en ON auditoria(creado_en);
CREATE INDEX idx_plantillas_faciales_trabajador_activo ON plantillas_faciales(id_trabajador, activo);

DELIMITER //

CREATE TRIGGER trg_tokens_qr_jti
BEFORE INSERT ON tokens_qr
FOR EACH ROW
BEGIN
  IF NEW.token_jti IS NULL OR NEW.token_jti = '' THEN
    SET NEW.token_jti = UUID();
  END IF;
END//

CREATE TRIGGER trg_evitar_doble_marcacion
BEFORE INSERT ON registros_asistencia
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM intentos_asistencia
    WHERE id_trabajador = NEW.id_trabajador
      AND aceptado = true
      AND intentado_en >= DATE_SUB(NEW.marcado_en, INTERVAL 5 MINUTE)
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Marcacion duplicada: el trabajador ya registro asistencia en los ultimos 5 minutos';
  END IF;

  INSERT INTO intentos_asistencia (
    id_trabajador,
    intentado_en,
    origen,
    aceptado,
    registrado_por_usuario,
    informacion_dispositivo
  ) VALUES (
    NEW.id_trabajador,
    NEW.marcado_en,
    NEW.origen,
    true,
    NEW.registrado_por_usuario,
    NEW.informacion_dispositivo
  );
END//

CREATE TRIGGER trg_aplicar_aprobacion_solicitud
AFTER INSERT ON aprobaciones_solicitud
FOR EACH ROW
BEGIN
  DECLARE asistencia_relacionada bigint unsigned;

  UPDATE solicitudes_trabajador
  SET estado = NEW.decision,
      actualizado_en = CURRENT_TIMESTAMP
  WHERE id_solicitud = NEW.id_solicitud;

  SELECT id_asistencia
  INTO asistencia_relacionada
  FROM solicitudes_trabajador
  WHERE id_solicitud = NEW.id_solicitud;

  IF NEW.decision = 'aprobada' AND asistencia_relacionada IS NOT NULL THEN
    UPDATE registros_asistencia
    SET estado = 'justificado',
        observacion = CONCAT(COALESCE(CONCAT(observacion, '\n'), ''), 'Justificacion aprobada: ', NEW.comentario),
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id_asistencia = asistencia_relacionada;
  END IF;
END//

DELIMITER ;

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

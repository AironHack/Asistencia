-- Indices y configuraciones agregadas durante el desarrollo operativo.

SET @db_name := DATABASE();

SET @idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'auditoria'
    AND index_name = 'idx_auditoria_creado_en'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_auditoria_creado_en ON auditoria(creado_en)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'auditoria'
    AND index_name = 'idx_auditoria_usuario_fecha'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_auditoria_usuario_fecha ON auditoria(id_usuario, creado_en)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'horas_extra'
    AND index_name = 'idx_horas_extra_trabajador_fecha'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_horas_extra_trabajador_fecha ON horas_extra(id_trabajador, fecha_hora_extra)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('logo_empresa_url', '""', 'URL del logo de la empresa'),
  ('tolerancia_global_minutos', '10', 'Tolerancia global sugerida en minutos')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion),
  actualizado_en = CURRENT_TIMESTAMP;

INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('qr_fotocheck_requiere_facial', 'true', 'Exige verificacion facial para registrar asistencia con fotocheck QR permanente')
ON DUPLICATE KEY UPDATE
  descripcion = VALUES(descripcion),
  actualizado_en = CURRENT_TIMESTAMP;

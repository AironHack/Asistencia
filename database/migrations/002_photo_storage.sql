ALTER TABLE trabajadores
  MODIFY url_foto MEDIUMTEXT;

ALTER TABLE fotos_trabajador
  MODIFY url_imagen MEDIUMTEXT NOT NULL;

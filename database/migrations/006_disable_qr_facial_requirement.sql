UPDATE configuraciones
   SET valor = 'false',
       descripcion = 'Permite registrar asistencia con fotocheck QR permanente sin verificacion facial adicional',
       actualizado_en = CURRENT_TIMESTAMP
 WHERE clave = 'qr_fotocheck_requiere_facial';

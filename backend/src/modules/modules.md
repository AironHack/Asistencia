# Modulos del backend

## Auth
Login web, sesiones, refresh tokens, bloqueo de usuarios inactivos y validacion de roles.

## Users
Cuentas del sistema web. Administra usuario, contrasena bcrypt, rol, estado y ultimo acceso.

## Employees
Personal/trabajadores, datos laborales, foto, area, cargo, jefe a cargo, estado activo/inactivo y soft delete.

## Attendance
Registro de entradas y salidas por QR, facial o manual. Calcula tardanza, estado, origen y previene doble marcacion.

## Schedules
Turnos fijos y rotativos. Asigna turnos por rango de fechas a trabajadores.

## Requests
Justificaciones de tardanza, ausencia y horas extras. Supervisor/Admin aprueba o rechaza con comentario obligatorio.

## Reports
Exportacion Excel/PDF para asistencias del dia, rangos, puntualidad mensual, tardanzas, areas, cargos y horas extras.

## Settings
Empresa, logo, zona horaria, facial global, confianza facial minima y umbral de alertas.

## QR
Genera QR firmado con HMAC-SHA256 desde el servidor para web y envio por WhatsApp. Valida firma, expiracion y revocacion.

## Face
Guarda fotos/plantillas faciales solo en servidor. Propone coincidencias y exige confirmacion del vigilante.

# Manual final - Sistema de Control de Asistencia

## 1. Requisitos

- Windows con Laragon.
- MySQL encendido desde Laragon.
- Node.js instalado.
- Navegador moderno.
- Para camara en celular: PC y celular en la misma red.

## 2. Estructura del proyecto

```text
backend/   API Express, autenticacion, asistencia, QR, facial, reportes y auditoria
web/       Frontend Vite
database/  Schema, seed y migraciones
docs/      Manuales y guias
backups/   Backups SQL locales
```

## 3. Base de datos en Laragon

1. Abre Laragon.
2. Enciende MySQL.
3. Entra a phpMyAdmin o Adminer.
4. Crea o selecciona la base `asistencia_db`.
5. Importa primero:

```text
database/schema.sql
```

6. Importa despues:

```text
database/seed.sql
```

Usuario inicial:

```text
Usuario: admin
Contrasena: admin123
```

## 4. Variables de entorno

El backend usa:

```text
backend/.env
```

Referencia:

```text
backend/.env.example
```

Variables principales:

```text
APP_PORT=3000
FRONTEND_ORIGIN=http://localhost:5180,http://127.0.0.1:5180
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=asistencia_db
DB_USERNAME=root
DB_PASSWORD=
JWT_ACCESS_SECRET=tu_clave_secreta_para_jwt
JWT_REFRESH_SECRET=tu_clave_secreta_para_refresh
QR_HMAC_SECRET=tu_clave_secreta_para_qr
```

## 5. Instalacion

Backend:

```powershell
cd backend
npm install
```

Frontend:

```powershell
cd web
npm install
```

## 6. Ejecucion manual

Backend:

```powershell
cd backend
node src/index.js
```

Debe mostrar:

```text
API de asistencia escuchando en http://localhost:3000
```

Frontend:

```powershell
cd web
npm run dev
```

Abrir:

```text
http://localhost:5180
```

## 7. Ejecucion con camara desde celular

Generar certificado HTTPS con la IP actual:

```powershell
cd web
npm run cert:https
```

Iniciar frontend HTTPS:

```powershell
npm run dev:https
```

Abrir en el celular la URL que muestre el comando, por ejemplo:

```text
https://192.168.137.137:5180
```

Si el navegador muestra aviso de certificado local, aceptalo.

## 8. Roles

- `admin`: acceso total.
- `supervisor`: trabajadores, reportes y solicitudes de su area.
- `vigilante`: registro de asistencia por QR/facial.
- `trabajador`: portal personal, asistencias, QR y solicitudes.

## 9. Flujos principales

### Personal

El admin puede:

- Crear trabajadores.
- Editar datos laborales.
- Desactivar sin borrar historial.
- Reactivar trabajadores.
- Asignar area, cargo y turno.
- Registrar foto URL.

### Areas y cargos

El admin puede:

- Crear areas.
- Crear cargos por area.
- Editar nombres.
- Desactivar/reactivar catalogos.

### Usuarios

El admin puede:

- Crear usuarios.
- Cambiar rol.
- Cambiar area.
- Desactivar/reactivar.
- Cambiar contrasena.

### Turnos

El admin puede:

- Crear turnos.
- Editar hora de entrada/salida.
- Definir tolerancia.
- Asignar turnos por rango de fechas.

### Asistencia

Metodos disponibles:

- Manual.
- QR firmado.
- Facial asistido.

Reglas:

- El sistema evita doble marcacion en menos de 5 minutos.
- Primero registra entrada.
- Luego registra salida.
- El admin puede corregir marcaciones.

### QR y fotocheck

El QR:

- Se genera desde backend.
- Se firma con HMAC-SHA256.
- Tiene expiracion.

El fotocheck:

- Se descarga como PNG.
- Se puede enviar por WhatsApp.

### Facial asistido

El admin puede enrolar una plantilla facial.

El vigilante/admin puede:

1. Subir o capturar foto.
2. Buscar coincidencias.
3. Confirmar trabajador.
4. Registrar asistencia facial.

Nota: es reconocimiento asistido por comparacion visual simple, no motor biometrico profesional.

### Solicitudes

El trabajador/admin puede:

- Crear solicitudes.
- Editar solicitudes pendientes.
- Cancelar solicitudes pendientes.

El supervisor/admin puede:

- Aprobar.
- Rechazar.
- Aprobar horas extra con minutos aprobados.

### Reportes

Permite:

- Filtrar asistencias por rango.
- Exportar CSV.
- Exportar Excel.
- Imprimir/guardar PDF.

### Auditoria

El admin puede revisar:

- Login/logout.
- Cambios de usuarios.
- Cambios de trabajadores.
- Solicitudes.
- Configuracion.
- Correcciones de asistencia.

## 10. Comandos utiles

Backend:

```powershell
cd backend
npm run migrate
npm run verify
npm run backup
npm run check:prod
npm run secrets
```

Frontend:

```powershell
cd web
npm run dev
npm run cert:https
npm run dev:https
npm run build
```

## 11. Backup y restauracion

Crear backup:

```powershell
cd backend
npm run backup
```

Se guarda en:

```text
backups/asistencia_db-YYYYMMDD-HHMMSS.sql
```

Restaurar:

1. Abre phpMyAdmin.
2. Selecciona `asistencia_db`.
3. Importa el `.sql` desde `backups/`.

## 12. Verificacion del sistema

Ejecutar:

```powershell
cd backend
npm run verify
```

Debe terminar con:

```text
Resultado: 0 error(es), 0 advertencia(s).
```

## 13. Produccion

Para produccion usa:

```text
backend/.env.production.example
```

Antes de publicar:

```powershell
cd backend
npm run backup
npm run migrate
npm run verify
npm run check:prod
```

Frontend:

```powershell
cd web
npm run build
```

Publicar el contenido de:

```text
web/dist
```

## 14. Errores comunes

### Puerto 3000 ocupado

Error:

```text
EADDRINUSE: address already in use :::3000
```

Solucion:

- Cierra el otro backend que usa el puerto.
- O cambia `APP_PORT` en `backend/.env`.

### Puerto 5180 ocupado

Error:

```text
Port 5180 is already in use
```

Solucion:

- Cierra el otro Vite.
- Revisa si esta abierto otro proyecto.

### Abre otro proyecto en localhost

Si `http://localhost:5180` muestra otro proyecto:

- Hay otro Vite corriendo en ese puerto.
- Cierra esa terminal.
- Vuelve a iniciar `npm run dev` dentro de `web`.

### Failed to fetch

Posibles causas:

- Backend apagado.
- Puerto backend incorrecto.
- CORS bloqueando origen.
- Frontend abierto por IP sin usar proxy/HTTPS.

Solucion rapida:

```powershell
cd backend
node src/index.js
```

Luego recarga la web.

### 401 Unauthorized

Posibles causas:

- No iniciaste sesion.
- Token expirado.
- Credenciales incorrectas.
- Usuario inactivo.

Solucion:

- Cierra sesion.
- Entra con `admin / admin123`.
- Verifica usuario activo.

### CORS origen no permitido

Ejemplo:

```text
Origen no permitido por CORS: http://192.168.x.x:5180
```

Solucion:

- En desarrollo el backend permite redes locales comunes.
- Si persiste, agrega el origen a `FRONTEND_ORIGIN` en `backend/.env`.
- Reinicia backend.

### Camara bloqueada

Mensaje:

```text
La camara requiere HTTPS o abrir la web en localhost.
```

Solucion:

```powershell
cd web
npm run cert:https
npm run dev:https
```

Luego abre la URL `https://IP_LOCAL:5180`.

### Marcacion duplicada

Mensaje:

```text
Marcacion duplicada: el trabajador ya registro asistencia en los ultimos 5 minutos
```

Es una regla normal del sistema. Espera 5 minutos o corrige desde admin si fue prueba.

## 15. Estado final

El sistema incluye:

- Login con JWT.
- Bloqueo por intentos fallidos.
- CRUD de usuarios.
- CRUD de trabajadores.
- Areas y cargos editables.
- Turnos y asignaciones.
- Registro manual, QR y facial asistido.
- Fotocheck PNG y WhatsApp.
- Solicitudes editables/cancelables.
- Aprobacion de horas extra.
- Reportes CSV/Excel/PDF.
- Dashboard.
- Auditoria.
- Migraciones.
- Backups.
- Verificacion automatica.
- Preparacion para produccion.

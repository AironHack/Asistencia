# Sistema de Control de Asistencia

Sistema web para gestionar trabajadores, turnos, marcaciones, QR, reconocimiento facial, solicitudes, reportes, configuracion y auditoria.

## Acceso Inicial

- Usuario: `admin`
- Contrasena: `admin123`

## Estructura

- `backend/`: API Express, autenticacion, asistencia, QR, facial, reportes, configuracion y auditoria.
- `web/`: frontend React + Mantine.
- `database/`: esquema MySQL y datos base.
- `docs/`: manuales y documentacion.
- `backups/`: copias generadas por scripts.

## Base De Datos Con Laragon

1. Abre Laragon.
2. Enciende MySQL.
3. Entra a phpMyAdmin o Adminer.
4. Importa `database/schema.sql`.
5. Importa `database/seed.sql`.
6. Si el proyecto ya tenia datos, ejecuta las migraciones desde backend.

Si ya tenias datos anteriores, importa nuevamente `database/seed.sql` para asegurar el usuario `admin / admin123`.

Para aplicar cambios nuevos sin borrar datos:

```powershell
cd backend
npm run migrate
```

## Variables Del Backend

Copia el ejemplo:

```powershell
cd backend
copy .env.example .env
```

Revisa que los datos coincidan con Laragon:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=asistencia_db
DB_USERNAME=root
DB_PASSWORD=
APP_PORT=3000
FRONTEND_ORIGIN=http://localhost:5180,http://127.0.0.1:5180
```

Antes de usar en produccion cambia los secretos:

```powershell
cd backend
npm run secrets
```

## Iniciar Manualmente

Backend:

```powershell
cd C:\Users\ALEXANDER\Desktop\ProyectosFuertes\Asistencia\backend
node src/index.js
```

Web:

```powershell
cd C:\Users\ALEXANDER\Desktop\ProyectosFuertes\Asistencia\web
npm run dev
```

Abre:

```text
http://localhost:5180
```

## Camara Y HTTPS

En computadora, la camara funciona abriendo la web por `localhost`:

```text
http://localhost:5180
```

Si abres por IP local, el navegador exige HTTPS. Para eso:

```powershell
cd C:\Users\ALEXANDER\Desktop\ProyectosFuertes\Asistencia\web
npm run cert:https
npm run dev:https
```

Luego abre la URL HTTPS que muestre Vite.

## Flujo Principal

1. Entra como admin.
2. Crea areas y cargos en `Personal`.
3. Registra trabajadores.
4. Captura el rostro base con camara desde `Personal > Rostro`.
5. Genera el fotocheck desde `Personal > QR`.
6. Crea turnos y asignaciones en `Turnos`.
7. Marca asistencia desde `Registrar`.
8. Revisa solicitudes en `Solicitudes`.
9. Genera reportes en `Reportes`.
10. Revisa cambios sensibles en `Auditoria`.

## Roles Del Sistema

- `admin`: puede administrar todo el sistema.
- `supervisor`: revisa personal, solicitudes y reportes de su area.
- `vigilante`: accede solo a `Registrar`; puede ver personal activo para marcar asistencia por QR o manual con verificacion facial.
- `trabajador`: accede solo a `Mi portal`; ve su fotocheck, QR, asistencias y solicitudes propias.

Todos los roles pueden ver `Mi portal`. Para que aparezcan fotocheck, QR y asistencias, el usuario debe estar vinculado a un trabajador desde `Personal > Editar trabajador > Usuario vinculado`.

## Fotocheck Y QR

El fotocheck se genera desde `Personal` con el boton `QR`. El sistema crea un QR firmado permanente, muestra los datos del trabajador y permite compartir el contenido por WhatsApp.

El trabajador tambien puede entrar con su usuario y contrasena. En `Mi portal` vera su fotocheck y podra abrirlo en pantalla completa para mostrar el QR al vigilante.

El QR esta firmado con `QR_HMAC_SECRET`. Eso evita que alguien modifique el contenido. Al escanear un QR valido, la asistencia se registra directamente y el sistema emite un sonido de confirmacion.

La verificacion facial queda disponible para registro manual, no para el flujo normal de QR.

## Reconocimiento Facial

- El admin captura el rostro base del trabajador desde `Personal > Rostro`.
- El sistema guarda la foto principal en `fotos_trabajador` y una plantilla facial `visual-hash-v2` derivada de la captura.
- Desde `Personal > Fotos`, el admin puede ver el historial de capturas y elegir cual sera la foto principal del trabajador.
- En `Registrar`, al seleccionar trabajador, se puede verificar rostro en vivo antes de marcar asistencia manual.
- Si ya existian plantillas antiguas, vuelve a capturar el rostro para aprovechar el modelo actual.

## Prueba Rapida Recomendada

1. Inicia Laragon y MySQL.
2. Inicia backend con `node src/index.js`.
3. Inicia web con `npm run dev`.
4. Abre `http://localhost:5180`.
5. Entra con `admin / admin123`.
6. Crea o edita un trabajador.
7. Captura rostro desde `Personal > Rostro`.
8. Genera fotocheck desde `Personal > QR`.
9. Entra como trabajador y abre el fotocheck en pantalla completa.
10. Entra como vigilante y escanea el QR para registrar asistencia directamente.

## Scripts Utiles

Backend:

```powershell
cd backend
npm run verify
npm run verify:flow
npm run backup
npm run migrate
npm run check:prod
```

Frontend:

```powershell
cd web
npm run build
```

## Solucion De Errores Comunes

Puerto ocupado:

- Backend usa `3000`.
- Web usa `5180`.
- Si otro proyecto esta usando esos puertos, cierralo o cambia el puerto en `.env` / scripts de Vite.

`Failed to fetch`:

- Verifica que el backend este activo en `http://localhost:3000`.
- Verifica que la web apunte a `/api` o a la URL correcta del backend.

Camara bloqueada:

- Abre `http://localhost:5180` en la misma PC.
- Para IP local usa HTTPS.

CORS por IP local:

- Agrega el origen permitido en `backend/src/app.js` o usa `localhost`.

## Verificacion Final

Antes de entregar o probar fuerte:

```powershell
cd backend
npm run verify
npm run verify:flow
```

```powershell
cd web
npm run build
```

Ambos deben terminar sin errores.

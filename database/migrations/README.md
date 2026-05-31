# Migraciones de base de datos

Estas migraciones sirven para actualizar una base existente sin reimportar `schema.sql` ni perder datos.

## Uso

1. Enciende MySQL en Laragon.
2. Verifica que `backend/.env` apunte a la base correcta.
3. Ejecuta:

```powershell
cd backend
npm run migrate
```

El runner crea la tabla `schema_migrations` y guarda cada archivo aplicado.

## Reglas

- Los archivos deben ir numerados: `001_nombre.sql`, `002_nombre.sql`, etc.
- No edites una migracion que ya aplicaste en una base real; crea una nueva.
- Mantén `schema.sql` como instalacion limpia y `migrations/` como actualizaciones incrementales.

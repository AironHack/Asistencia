const fs = require('fs');
const path = require('path');

const { pool } = require('../config/database');

const migrationsDir = path.resolve(__dirname, '../../../database/migrations');

function limpiarSql(sql) {
  return sql
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter(Boolean);
}

async function asegurarTablaMigraciones(conexion) {
  await conexion.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id_migracion varchar(180) PRIMARY KEY,
      aplicado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

async function migracionesAplicadas(conexion) {
  const [filas] = await conexion.query('SELECT id_migracion FROM schema_migrations');
  return new Set(filas.map((fila) => fila.id_migracion));
}

async function aplicarMigracion(conexion, archivo) {
  const ruta = path.join(migrationsDir, archivo);
  const sentencias = limpiarSql(fs.readFileSync(ruta, 'utf8'));

  console.log(`Aplicando ${archivo}...`);

  for (const sentencia of sentencias) {
    await conexion.query(sentencia);
  }

  await conexion.query(
    'INSERT INTO schema_migrations (id_migracion) VALUES (?)',
    [archivo]
  );
}

async function main() {
  if (!fs.existsSync(migrationsDir)) {
    console.log('No existe database/migrations. Nada que aplicar.');
    return;
  }

  const archivos = fs.readdirSync(migrationsDir)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();

  const conexion = await pool.getConnection();

  try {
    await asegurarTablaMigraciones(conexion);
    const aplicadas = await migracionesAplicadas(conexion);

    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) {
        console.log(`Saltando ${archivo} (ya aplicada).`);
        continue;
      }

      await aplicarMigracion(conexion, archivo);
    }

    console.log('Migraciones completadas.');
  } finally {
    conexion.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error aplicando migraciones:', error);
  process.exit(1);
});

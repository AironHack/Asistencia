const fs = require('fs');
const path = require('path');

const { env } = require('../config/env');
const { consultar, pool } = require('../config/database');

const rootDir = path.resolve(__dirname, '../../..');
const backupDir = path.join(rootDir, 'backups');

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('')
    + '-'
    + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');
}

function escapeIdent(nombre) {
  return `\`${String(nombre).replaceAll('`', '``')}\``;
}

function escapeSql(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (valor instanceof Date) return `'${valor.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(valor)) return `X'${valor.toString('hex')}'`;
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : 'NULL';
  if (typeof valor === 'bigint') return String(valor);
  if (typeof valor === 'boolean') return valor ? '1' : '0';
  return `'${String(valor).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

async function obtenerTablas() {
  const tablas = await consultar(
    `SELECT table_name AS nombre
       FROM information_schema.tables
      WHERE table_schema = :database
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    { database: env.db.database }
  );

  return tablas.map((tabla) => tabla.nombre);
}

async function obtenerVistas() {
  const vistas = await consultar(
    `SELECT table_name AS nombre
       FROM information_schema.views
      WHERE table_schema = :database
      ORDER BY table_name`,
    { database: env.db.database }
  );

  return vistas.map((vista) => vista.nombre);
}

async function obtenerCreateTable(tabla) {
  const filas = await consultar(`SHOW CREATE TABLE ${escapeIdent(tabla)}`);
  return filas[0]['Create Table'];
}

async function obtenerCreateView(vista) {
  const filas = await consultar(`SHOW CREATE VIEW ${escapeIdent(vista)}`);
  return filas[0]['Create View'];
}

async function escribirDatos(stream, tabla) {
  const filas = await consultar(`SELECT * FROM ${escapeIdent(tabla)}`);

  if (!filas.length) {
    stream.write(`\n-- Sin datos en ${tabla}\n`);
    return;
  }

  const columnas = Object.keys(filas[0]);
  const columnasSql = columnas.map(escapeIdent).join(', ');
  const lote = 80;

  for (let i = 0; i < filas.length; i += lote) {
    const fragmento = filas.slice(i, i + lote);
    const valores = fragmento
      .map((fila) => `(${columnas.map((columna) => escapeSql(fila[columna])).join(', ')})`)
      .join(',\n');

    stream.write(`INSERT INTO ${escapeIdent(tabla)} (${columnasSql}) VALUES\n${valores};\n`);
  }
}

async function main() {
  fs.mkdirSync(backupDir, { recursive: true });

  const archivo = path.join(backupDir, `${env.db.database}-${timestamp()}.sql`);
  const stream = fs.createWriteStream(archivo, { encoding: 'utf8' });
  const tablas = await obtenerTablas();
  const vistas = await obtenerVistas();

  stream.write(`-- Backup de ${env.db.database}\n`);
  stream.write(`-- Generado: ${new Date().toISOString()}\n\n`);
  stream.write(`CREATE DATABASE IF NOT EXISTS ${escapeIdent(env.db.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`);
  stream.write(`USE ${escapeIdent(env.db.database)};\n\n`);
  stream.write('SET FOREIGN_KEY_CHECKS=0;\n\n');

  for (const vista of vistas.reverse()) {
    stream.write(`DROP VIEW IF EXISTS ${escapeIdent(vista)};\n`);
  }

  for (const tabla of tablas.reverse()) {
    stream.write(`DROP TABLE IF EXISTS ${escapeIdent(tabla)};\n`);
  }

  stream.write('\n');

  for (const tabla of tablas.reverse()) {
    stream.write(`${await obtenerCreateTable(tabla)};\n\n`);
  }

  for (const tabla of tablas) {
    stream.write(`-- Datos de ${tabla}\n`);
    await escribirDatos(stream, tabla);
    stream.write('\n');
  }

  for (const vista of vistas.reverse()) {
    stream.write(`DROP VIEW IF EXISTS ${escapeIdent(vista)};\n`);
    stream.write(`${await obtenerCreateView(vista)};\n\n`);
  }

  stream.write('SET FOREIGN_KEY_CHECKS=1;\n');
  stream.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const stats = fs.statSync(archivo);
  console.log(`Backup creado: ${archivo}`);
  console.log(`Tamano: ${(stats.size / 1024).toFixed(1)} KB`);
}

main()
  .catch((error) => {
    console.error('Error creando backup:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

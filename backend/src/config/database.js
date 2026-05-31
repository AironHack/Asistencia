const mysql = require('mysql2/promise');
const { env } = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000,
  namedPlaceholders: true,
  timezone: 'Z'
});

async function consultar(sql, parametros = {}) {
  const [filas] = await pool.execute(sql, parametros);
  return filas;
}

async function transaccion(callback) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await callback(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function probarConexion() {
  await consultar('SELECT 1 AS conectado');
}

module.exports = { pool, consultar, transaccion, probarConexion };

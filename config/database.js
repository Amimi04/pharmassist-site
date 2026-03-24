const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pharmabot',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00'
  // multipleStatements intentionally omitted: pool.execute() (prepared statements)
  // conflicts with multipleStatements:true on MySQL 8.x causing ER_WRONG_ARGUMENTS.
  // Migration uses its own isolated pool with multipleStatements:true.
});

async function getConnection() {
  return pool.getConnection();
}

async function query(sql, params) {
  // Use pool.query() (text protocol) instead of pool.execute() (binary prepared
  // statement protocol). pool.execute() with MySQL 8.x raises ER_WRONG_ARGUMENTS
  // (errno: 1210) for LIMIT/OFFSET parameters. pool.query() still escapes all
  // params via mysql2, so SQL injection protection is fully maintained.
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connexion MySQL établie avec succès');
    conn.release();
    return true;
  } catch (err) {
    console.error('❌ Erreur connexion MySQL:', err.message);
    return false;
  }
}

module.exports = { pool, getConnection, query, testConnection };


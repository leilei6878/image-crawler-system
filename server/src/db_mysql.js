const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'image_crawler',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

pool.getConnection()
  .then(conn => {
    console.log('[DB] MySQL连接成功');
    conn.release();
  })
  .catch(err => {
    console.error('[DB] MySQL连接失败:', err.message);
  });

function adaptSql(sql) {
  let adapted = sql.replace(/\s+RETURNING\s+id\s*/gi, ' ');
  adapted = adapted.replace(/\bCOALESCE\b/gi, 'IFNULL');
  adapted = adapted.replace(/INTERVAL\s+'(\d+)\s+seconds'/gi, 'INTERVAL $1 SECOND');
  adapted = adapted.replace(/\btrue\b/gi, '1').replace(/\bfalse\b/gi, '0');
  adapted = adapted.replace(/ON CONFLICT DO NOTHING/gi, 'ON DUPLICATE KEY UPDATE id=id');
  adapted = adapted.replace(/ON CONFLICT \([^)]+\) DO NOTHING/gi, 'ON DUPLICATE KEY UPDATE id=id');
  return adapted;
}

function wrapResult(sql, rows) {
  if (sql.trim().toUpperCase().startsWith('INSERT') && rows.insertId) {
    return [[{ id: rows.insertId }]];
  }
  return [rows];
}

function convertParams(sql, params) {
  let idx = 0;
  const newSql = sql.replace(/\$(\d+)/g, () => '?');
  return [newSql, params];
}

const db = {
  async execute(sql, params = []) {
    let [adaptedSql, adaptedParams] = convertParams(sql, params);
    adaptedSql = adaptSql(adaptedSql);
    const [rows] = await pool.execute(adaptedSql, adaptedParams);
    return wrapResult(sql, rows);
  },

  async getConnection() {
    const conn = await pool.getConnection();
    return {
      async execute(sql, params = []) {
        let [adaptedSql, adaptedParams] = convertParams(sql, params);
        adaptedSql = adaptSql(adaptedSql);
        const [rows] = await conn.execute(adaptedSql, adaptedParams);
        return wrapResult(sql, rows);
      },
      async beginTransaction() {
        await conn.beginTransaction();
      },
      async commit() {
        await conn.commit();
      },
      async rollback() {
        await conn.rollback();
      },
      release() {
        conn.release();
      }
    };
  }
};

module.exports = db;

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false } : false
});

pool.connect()
  .then(client => {
    console.log('[DB] PostgreSQL连接成功');
    client.release();
  })
  .catch(err => {
    console.error('[DB] PostgreSQL连接失败:', err.message);
  });

// Convert MySQL ? placeholders to PostgreSQL $1, $2, ...
function convertQuery(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Wrapper to behave like mysql2 pool
const db = {
  async execute(sql, params = []) {
    const convertedSql = convertQuery(sql);
    const result = await pool.query(convertedSql, params);
    return [result.rows];
  },

  async getConnection() {
    const client = await pool.connect();
    return {
      async execute(sql, params = []) {
        const convertedSql = convertQuery(sql);
        const result = await client.query(convertedSql, params);
        return [result.rows];
      },
      async beginTransaction() {
        await client.query('BEGIN');
      },
      async commit() {
        await client.query('COMMIT');
      },
      async rollback() {
        await client.query('ROLLBACK');
      },
      release() {
        client.release();
      }
    };
  }
};

module.exports = db;

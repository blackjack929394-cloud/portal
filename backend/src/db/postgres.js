import pg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;

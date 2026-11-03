#!/usr/bin/env node
// Миграция данных из старых SQLite .db-файлов в PostgreSQL.
// Запускать на сервере рядом с рабочей папкой backend, где лежат storage/*.db.
//
// Использование:
//   node scripts/migrate_sqlite_to_postgres.js [--dry-run]

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const dryRun = process.argv.includes('--dry-run');

const dirName = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.resolve(dirName, '../storage');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, ssl: false });

function isoOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  // SQLite может хранить уже ISO-строку.
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1',
    [name],
  );
  return rows.length > 0;
}

async function migrateUsers(client) {
  const dbPath = path.join(storageDir, 'directory.db');
  if (!fs.existsSync(dbPath)) return console.log('  directory.db not found, skipping users/employees/guests');
  const db = new DatabaseSync(dbPath);

  // users
  try {
    const rows = db.prepare('SELECT * FROM users').all();
    console.log(`  migrating ${rows.length} users`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO users (username, email, full_name, pass_hash, pass_salt, created_at, last_login, blocked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(username) DO UPDATE SET
           email = EXCLUDED.email,
           full_name = EXCLUDED.full_name,
           pass_hash = EXCLUDED.pass_hash,
           pass_salt = EXCLUDED.pass_salt,
           last_login = EXCLUDED.last_login,
           blocked = EXCLUDED.blocked`,
        [r.username, r.email, r.full_name, r.pass_hash, r.pass_salt, isoOrNull(r.created_at), isoOrNull(r.last_login), !!r.blocked],
      );
    }
  } catch (err) {
    console.log('  users table missing or empty:', err.message);
  }

  // employees
  try {
    const rows = db.prepare('SELECT * FROM employees').all();
    console.log(`  migrating ${rows.length} employees`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO employees (sub, full_name, email, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(sub) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           last_login = EXCLUDED.last_login`,
        [r.sub, r.full_name, r.email, isoOrNull(r.created_at), isoOrNull(r.last_login)],
      );
    }
  } catch (err) {
    console.log('  employees table missing or empty:', err.message);
  }

  // guests
  try {
    const rows = db.prepare('SELECT * FROM guests').all();
    console.log(`  migrating ${rows.length} guests`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO guests (email, full_name, created_at, last_seen)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(email) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           last_seen = EXCLUDED.last_seen`,
        [r.email, r.full_name, isoOrNull(r.created_at), isoOrNull(r.last_seen)],
      );
    }
  } catch (err) {
    console.log('  guests table missing or empty:', err.message);
  }

  db.close();
}

async function migrateSubscriptions(client) {
  const dbPath = path.join(storageDir, 'vpn_subscriptions.db');
  if (!fs.existsSync(dbPath)) return console.log('  vpn_subscriptions.db not found, skipping');
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db.prepare('SELECT * FROM vpn_subscriptions').all();
    console.log(`  migrating ${rows.length} subscriptions`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO vpn_subscriptions (id, user_sub, user_name, user_email, token, status, expires_at, traffic_limit_gb, traffic_used_gb, created_at, updated_at, revoked_at, revoked_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT(id) DO UPDATE SET
           user_sub = EXCLUDED.user_sub,
           user_name = EXCLUDED.user_name,
           user_email = EXCLUDED.user_email,
           token = EXCLUDED.token,
           status = EXCLUDED.status,
           expires_at = EXCLUDED.expires_at,
           traffic_limit_gb = EXCLUDED.traffic_limit_gb,
           traffic_used_gb = EXCLUDED.traffic_used_gb,
           updated_at = EXCLUDED.updated_at,
           revoked_at = EXCLUDED.revoked_at,
           revoked_reason = EXCLUDED.revoked_reason`,
        [r.id, r.user_sub, r.user_name, r.user_email, r.token, r.status || 'active',
          isoOrNull(r.expires_at), r.traffic_limit_gb, r.traffic_used_gb || 0,
          isoOrNull(r.created_at), isoOrNull(r.updated_at), isoOrNull(r.revoked_at), r.revoked_reason],
      );
    }
  } catch (err) {
    console.log('  vpn_subscriptions table missing or empty:', err.message);
  }
  db.close();
}

async function migrateNodes(client) {
  const dbPath = path.join(storageDir, 'vpn_nodes.db');
  if (!fs.existsSync(dbPath)) return console.log('  vpn_nodes.db not found, skipping');
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db.prepare('SELECT * FROM vpn_nodes').all();
    console.log(`  migrating ${rows.length} nodes`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO vpn_nodes (id, name, host, port, protocol, kind, region, provider, status, public_key, extra_json,
          deployment_status, deployment_error, wg_tunnel_ip, wg_public_key, wg_private_key,
          ssh_host, ssh_port, ssh_user, ssh_key, ssh_key_path, ssh_key_base64,
          intermediate_host, intermediate_public_port, hysteria_config_json, created_at, updated_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
         ON CONFLICT(id) DO UPDATE SET
           name = EXCLUDED.name, host = EXCLUDED.host, port = EXCLUDED.port, protocol = EXCLUDED.protocol,
           kind = EXCLUDED.kind, region = EXCLUDED.region, provider = EXCLUDED.provider, status = EXCLUDED.status,
           public_key = EXCLUDED.public_key, extra_json = EXCLUDED.extra_json,
           deployment_status = EXCLUDED.deployment_status, deployment_error = EXCLUDED.deployment_error,
           wg_tunnel_ip = EXCLUDED.wg_tunnel_ip, wg_public_key = EXCLUDED.wg_public_key, wg_private_key = EXCLUDED.wg_private_key,
           ssh_host = EXCLUDED.ssh_host, ssh_port = EXCLUDED.ssh_port, ssh_user = EXCLUDED.ssh_user,
           ssh_key = EXCLUDED.ssh_key, ssh_key_path = EXCLUDED.ssh_key_path, ssh_key_base64 = EXCLUDED.ssh_key_base64,
           intermediate_host = EXCLUDED.intermediate_host, intermediate_public_port = EXCLUDED.intermediate_public_port,
           hysteria_config_json = EXCLUDED.hysteria_config_json, updated_at = EXCLUDED.updated_at, last_seen_at = EXCLUDED.last_seen_at`,
        [r.id, r.name, r.host, r.port || 443, r.protocol || 'sing-box', r.kind || r.protocol || 'sing-box',
          r.region, r.provider, r.status || 'active', r.public_key, r.extra_json || '{}',
          r.deployment_status, r.deployment_error, r.wg_tunnel_ip, r.wg_public_key, r.wg_private_key,
          r.ssh_host, r.ssh_port || 22, r.ssh_user || 'root', r.ssh_key, r.ssh_key_path, r.ssh_key_base64,
          r.intermediate_host, r.intermediate_public_port, r.hysteria_config_json,
          isoOrNull(r.created_at), isoOrNull(r.updated_at), isoOrNull(r.last_seen_at)],
      );
    }
  } catch (err) {
    console.log('  vpn_nodes table missing or empty:', err.message);
  }
  db.close();
}

async function migrateRoutingProfiles(client) {
  const dbPath = path.join(storageDir, 'routing_profiles.db');
  if (!fs.existsSync(dbPath)) return console.log('  routing_profiles.db not found, skipping');
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db.prepare('SELECT * FROM routing_profiles').all();
    console.log(`  migrating ${rows.length} routing profiles`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO routing_profiles (user_sub, mode, ru_direct, presets, proxy_domains, direct_domains, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(user_sub) DO UPDATE SET
           mode = EXCLUDED.mode, ru_direct = EXCLUDED.ru_direct, presets = EXCLUDED.presets,
           proxy_domains = EXCLUDED.proxy_domains, direct_domains = EXCLUDED.direct_domains, updated_at = EXCLUDED.updated_at`,
        [r.user_sub, r.mode || 'global', !!r.ru_direct, r.presets || '[]', r.proxy_domains || '[]', r.direct_domains || '[]', isoOrNull(r.updated_at)],
      );
    }
  } catch (err) {
    console.log('  routing_profiles table missing or empty:', err.message);
  }
  db.close();
}

async function migrateChatMessages(client) {
  const dbPath = path.join(storageDir, 'chat.db');
  if (!fs.existsSync(dbPath)) return console.log('  chat.db not found, skipping');
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db.prepare('SELECT * FROM chat_messages').all();
    console.log(`  migrating ${rows.length} chat messages`);
    for (const r of rows) {
      if (dryRun) continue;
      await client.query(
        `INSERT INTO chat_messages (id, user_sub, user_name, user_email, sender, text, created_at, read_by_admin, read_by_user)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(id) DO UPDATE SET
           user_sub = EXCLUDED.user_sub, user_name = EXCLUDED.user_name, user_email = EXCLUDED.user_email,
           sender = EXCLUDED.sender, text = EXCLUDED.text, created_at = EXCLUDED.created_at,
           read_by_admin = EXCLUDED.read_by_admin, read_by_user = EXCLUDED.read_by_user`,
        [r.id, r.user_sub, r.user_name, r.user_email, r.sender, r.text, isoOrNull(r.created_at), !!r.read_by_admin, !!r.read_by_user],
      );
    }
  } catch (err) {
    console.log('  chat_messages table missing or empty:', err.message);
  }
  db.close();
}

async function runSchema(client) {
  const schemaPath = path.resolve(dirName, '../migrations/001_init_postgres.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Applying schema...');
  if (!dryRun) await client.query(sql);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Storage dir:', storageDir);
    console.log('Dry run:', dryRun);

    await runSchema(client);

    console.log('Migrating directory...');
    await migrateUsers(client);

    console.log('Migrating subscriptions...');
    await migrateSubscriptions(client);

    console.log('Migrating nodes...');
    await migrateNodes(client);

    console.log('Migrating routing profiles...');
    await migrateRoutingProfiles(client);

    console.log('Migrating chat messages...');
    await migrateChatMessages(client);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

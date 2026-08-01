require('dotenv').config();
const fs = require('fs');
const path = require('path');

// DB_CLIENT=sqlite (default, zero-config) or DB_CLIENT=pg (needs DATABASE_URL or PG* env vars)
const client = process.env.DB_CLIENT === 'pg' ? 'pg' : 'better-sqlite3';

const sqliteFile = process.env.SQLITE_FILE || './data/hrsystem.sqlite3';
fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });

const sqliteConfig = {
  client: 'better-sqlite3',
  useNullAsDefault: true,
  connection: { filename: sqliteFile },
  migrations: { directory: './src/migrations' },
};

const pgConfig = {
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'hrsystem',
  },
  migrations: { directory: './src/migrations' },
  pool: { min: 2, max: 10 },
};

module.exports = client === 'pg' ? pgConfig : sqliteConfig;

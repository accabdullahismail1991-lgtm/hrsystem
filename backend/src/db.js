const fs = require('fs');
const path = require('path');
const knexConfig = require('../knexfile');

if (knexConfig.client === 'better-sqlite3') {
  const dir = path.dirname(knexConfig.connection.filename);
  fs.mkdirSync(dir, { recursive: true });
}

const knex = require('knex')(knexConfig);

// knex's `insert()` return value differs by dialect: SQLite/MySQL give the
// raw id back, Postgres only does with `.returning()` and then wraps it in
// an object. This normalizes both to a single id.
async function insertReturningId(queryBuilder, table, data) {
  const rows = await queryBuilder(table).insert(data).returning('id');
  const first = rows[0];
  return typeof first === 'object' && first !== null ? first.id : first;
}

module.exports = knex;
module.exports.insertReturningId = insertReturningId;

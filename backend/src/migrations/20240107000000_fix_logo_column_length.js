/**
 * Bug fix: logo_data_url was declared as a default string column
 * (VARCHAR(255) on Postgres). SQLite doesn't enforce that length, so it
 * worked in local/dev testing, but Postgres does — every logo upload
 * failed against the real deployed database. Widen it to unlimited text.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('companies', (t) => {
    t.text('logo_data_url').alter();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('companies', (t) => {
    t.string('logo_data_url').alter();
  });
};

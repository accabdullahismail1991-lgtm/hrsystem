/**
 * A super admin is a platform-level owner (not a per-company role) who can
 * see and manage every company in the system and grant/revoke external
 * users access to any specific company, without being a member of it.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('is_super_admin').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('is_super_admin');
  });
};

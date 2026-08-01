/**
 * Configurable approval signatures shown on printed documents (payroll
 * summary, etc.) — same shape as the original app's settings.signatures.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('companies', (t) => {
    t.text('signatures'); // JSON: [{titleAr, titleEn, name}]
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('companies', (t) => {
    t.dropColumn('signatures');
  });
};

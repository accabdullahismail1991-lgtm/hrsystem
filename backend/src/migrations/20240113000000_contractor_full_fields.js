/**
 * Fuller identity/registry fields for contractors (external/subcontracted
 * labor) — these workers are explicitly outside this company's kafala
 * (sponsorship), so we track who they ARE sponsored/employed by
 * (sponsorName) alongside their own ID and banking details, matching the
 * depth of the Employee definition screen.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('contractors', (t) => {
    t.string('id_no');
    t.string('id_type'); // Iqama | Passport | CR (commercial registration, for agencies)
    t.string('nat'); // nationality
    t.string('sponsor_name'); // the entity that actually sponsors/employs this worker
    t.string('bank');
    t.string('iban');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('contractors', (t) => {
    t.dropColumn('id_no');
    t.dropColumn('id_type');
    t.dropColumn('nat');
    t.dropColumn('sponsor_name');
    t.dropColumn('bank');
    t.dropColumn('iban');
  });
};

/**
 * Brings the employees table up to the full field set of the original
 * app's employee registry (identity/personal/employment details beyond
 * the payroll-essential fields added in the initial migration).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('employees', (t) => {
    t.string('cc'); // free-text cost center label (independent of branch_id link)
    t.string('idtype'); // National ID / Iqama / Passport
    t.date('idexp'); // ID expiry
    t.string('iqama');
    t.string('passport');
    t.string('nat'); // nationality
    t.string('gender');
    t.date('dob');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('cc');
    t.dropColumn('idtype');
    t.dropColumn('idexp');
    t.dropColumn('iqama');
    t.dropColumn('passport');
    t.dropColumn('nat');
    t.dropColumn('gender');
    t.dropColumn('dob');
  });
};

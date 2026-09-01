/**
 * Adds a bonus/reward (مكافآت) line item to contractor payroll lines, and
 * folds it into the net amount alongside the existing deduction.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('contractor_payroll_lines', (t) => {
    t.decimal('bonus', 12, 2).notNullable().defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('contractor_payroll_lines', (t) => {
    t.dropColumn('bonus');
  });
};

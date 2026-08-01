/**
 * Stores "due salary" (salary base after absence deduction, before
 * overtime/bonus) as its own snapshot field — the original app showed
 * this as a distinct column from gross pay on both the payroll table
 * and the summary export.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('payroll_lines', (t) => {
    t.decimal('due_salary', 12, 2).notNullable().defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('payroll_lines', (t) => {
    t.dropColumn('due_salary');
  });
};

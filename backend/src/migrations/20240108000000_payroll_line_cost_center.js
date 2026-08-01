/**
 * Snapshots the employee's empno/idno/cost-center onto each payroll line
 * (same snapshot pattern as namear_snapshot/dept_snapshot) — these were
 * present on every row of the original app's payroll working set and
 * shown on the printed slip, but had been dropped when this line-item
 * table was first designed.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('payroll_lines', (t) => {
    t.string('empno_snapshot');
    t.string('idno_snapshot');
    t.string('cc_snapshot');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('payroll_lines', (t) => {
    t.dropColumn('empno_snapshot');
    t.dropColumn('idno_snapshot');
    t.dropColumn('cc_snapshot');
  });
};

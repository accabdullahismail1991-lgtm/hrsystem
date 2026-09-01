/**
 * Adds a project the employee's salary is charged to (cost allocation),
 * independent of the existing branch-linked cost center (`cc`). Snapshotted
 * onto payroll lines like the other identity fields; when a line has no
 * project assigned, the UI falls back to the branch's cost center.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('employees', (t) => {
    t.string('project'); // free-text project/cost allocation label
  });
  await knex.schema.alterTable('payroll_lines', (t) => {
    t.string('project_snapshot');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('project');
  });
  await knex.schema.alterTable('payroll_lines', (t) => {
    t.dropColumn('project_snapshot');
  });
};

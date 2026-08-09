/**
 * Daily hours / overtime log per employee. Overtime hours logged here feed
 * automatically into a payroll run's "overtime" pay when the run is
 * generated (Art. 107 of the executive regulations: overtime pay = basic
 * hourly wage + 50%, i.e. 150% of the basic hourly rate).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('daily_hours_logs', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.string('namear_snapshot').notNullable();
    t.string('empno_snapshot');
    t.date('work_date').notNullable();
    t.decimal('regular_hours', 6, 2).notNullable().defaultTo(0);
    t.decimal('overtime_hours', 6, 2).notNullable().defaultTo(0);
    t.text('notes');
    t.timestamps(true, true);
    t.index(['company_id', 'employee_id', 'work_date']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('daily_hours_logs');
};

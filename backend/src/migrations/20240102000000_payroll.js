/**
 * Payroll runs/lines, advances, settlements, and EOS gratuity records —
 * all company-scoped, matching the calculation logic from the original
 * single-file app (see src/payrollCalc.js).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('payroll_runs', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('month').notNullable(); // 1-12
    t.integer('year_g').notNullable(); // Gregorian year
    t.string('year_h'); // Hijri year (free text, matches original UI)
    t.integer('work_days').notNullable().defaultTo(30);
    t.string('status').notNullable().defaultTo('Draft');
    t.timestamps(true, true);
    t.unique(['company_id', 'month', 'year_g']);
  });

  await knex.schema.createTable('payroll_lines', (t) => {
    t.increments('id').primary();
    t.integer('payroll_run_id').notNullable().references('id').inTable('payroll_runs').onDelete('CASCADE');
    t.integer('employee_id').references('id').inTable('employees').onDelete('SET NULL');
    t.string('namear_snapshot').notNullable();
    t.string('dept_snapshot');
    t.decimal('basic', 12, 2).notNullable().defaultTo(0);
    t.decimal('housing', 12, 2).notNullable().defaultTo(0);
    t.decimal('transport', 12, 2).notNullable().defaultTo(0);
    t.decimal('other', 12, 2).notNullable().defaultTo(0);
    t.decimal('overtime', 12, 2).notNullable().defaultTo(0);
    t.decimal('bonus', 12, 2).notNullable().defaultTo(0);
    t.integer('absent_days').notNullable().defaultTo(0);
    t.decimal('advance_deduction', 12, 2).notNullable().defaultTo(0);
    t.decimal('other_deduction', 12, 2).notNullable().defaultTo(0);
    t.decimal('gosi_emp', 12, 2).notNullable().defaultTo(0);
    t.decimal('health_ins', 12, 2).notNullable().defaultTo(0);
    t.decimal('income_tax', 12, 2).notNullable().defaultTo(0);
    t.decimal('union_fee', 12, 2).notNullable().defaultTo(0);
    t.decimal('gosi_er', 12, 2).notNullable().defaultTo(0);
    t.decimal('other_er', 12, 2).notNullable().defaultTo(0);
    t.string('pay_method').notNullable().defaultTo('Transfer');
    t.text('note');
    // Snapshot of computed results — see payrollCalc.js. Stored (not
    // recomputed on read) so a later salary change never rewrites history.
    t.decimal('absence_deduction', 12, 2).notNullable().defaultTo(0);
    t.decimal('gross_pay', 12, 2).notNullable().defaultTo(0);
    t.decimal('total_deductions', 12, 2).notNullable().defaultTo(0);
    t.decimal('net_pay', 12, 2).notNullable().defaultTo(0);
    t.decimal('employer_cost', 12, 2).notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['payroll_run_id']);
  });

  await knex.schema.createTable('advances', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('employee_id').references('id').inTable('employees').onDelete('SET NULL');
    t.string('namear_snapshot').notNullable();
    t.decimal('amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('monthly', 12, 2).notNullable().defaultTo(0);
    t.date('date');
    t.text('notes');
    t.timestamps(true, true);
    t.index(['company_id']);
  });

  await knex.schema.createTable('settlements', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('advance_id').notNullable().references('id').inTable('advances').onDelete('CASCADE');
    t.decimal('amount', 12, 2).notNullable().defaultTo(0);
    t.date('date');
    t.string('month');
    t.text('notes');
    t.timestamps(true, true);
    t.index(['company_id']);
  });

  await knex.schema.createTable('eos_records', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('employee_id').references('id').inTable('employees').onDelete('SET NULL');
    t.string('namear_snapshot').notNullable();
    t.string('empno_snapshot');
    t.string('dept_snapshot');
    t.date('hire_date');
    t.date('end_date');
    t.string('reason').notNullable().defaultTo('snapshot'); // terminated | resigned | snapshot
    t.decimal('basic', 12, 2).notNullable().defaultTo(0);
    t.decimal('housing', 12, 2).notNullable().defaultTo(0);
    t.decimal('gratuity', 12, 2).notNullable().defaultTo(0);
    t.decimal('other_dues', 12, 2).notNullable().defaultTo(0);
    t.decimal('deductions', 12, 2).notNullable().defaultTo(0);
    t.decimal('net_eos', 12, 2).notNullable().defaultTo(0);
    t.string('status').notNullable().defaultTo('Pending'); // Pending | Approved | Paid
    t.date('calc_date');
    t.timestamps(true, true);
    t.index(['company_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('eos_records');
  await knex.schema.dropTableIfExists('settlements');
  await knex.schema.dropTableIfExists('advances');
  await knex.schema.dropTableIfExists('payroll_lines');
  await knex.schema.dropTableIfExists('payroll_runs');
};

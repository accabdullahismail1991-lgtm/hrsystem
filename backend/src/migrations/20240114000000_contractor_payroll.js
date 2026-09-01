/**
 * Payment runs for external/subcontracted labor (contractors) — kept
 * entirely separate from the employee payroll_runs/payroll_lines tables
 * since contractors are outside this company's kafala (sponsorship) and
 * paid under individual contracts, not payroll.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('contractor_payroll_runs', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('month').notNullable();
    t.integer('year_g').notNullable();
    t.string('year_h');
    t.string('status').notNullable().defaultTo('Draft'); // Draft | Approved | Paid
    t.timestamps(true, true);
    t.index(['company_id']);
  });

  await knex.schema.createTable('contractor_payroll_lines', (t) => {
    t.increments('id').primary();
    t.integer('run_id').notNullable().references('id').inTable('contractor_payroll_runs').onDelete('CASCADE');
    t.integer('contractor_id').references('id').inTable('contractors').onDelete('SET NULL');
    t.string('name_snapshot').notNullable();
    t.string('id_no_snapshot');
    t.string('contract_type_snapshot');
    t.string('sponsor_snapshot');
    t.decimal('amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('deduction', 12, 2).notNullable().defaultTo(0);
    t.decimal('net_amount', 12, 2).notNullable().defaultTo(0);
    t.string('pay_method').notNullable().defaultTo('Transfer');
    t.text('note');
    t.timestamps(true, true);
    t.index(['run_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('contractor_payroll_lines');
  await knex.schema.dropTableIfExists('contractor_payroll_runs');
};

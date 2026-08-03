/**
 * Leave requests per KSA Labor Law Executive Regulations Articles 33-44:
 * annual leave (accrued by tenure), sick leave (30 full / 60 at 3/4 / 30
 * unpaid pay tiers per rolling 365-day "sick year"), and the fixed-duration
 * occasion leaves (marriage, birth, death, Hajj, exam, iddah, unpaid/other).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('leave_requests', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('employee_id').references('id').inTable('employees').onDelete('SET NULL');
    t.string('namear_snapshot').notNullable();
    t.string('empno_snapshot');
    t.string('leave_type').notNullable(); // annual|sick|marriage|birth|death|hajj|exam|iddah_muslim|iddah_nonmuslim|unpaid|other
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.integer('days').notNullable();
    t.decimal('paid_days', 8, 2).notNullable().defaultTo(0);
    t.decimal('unpaid_days', 8, 2).notNullable().defaultTo(0);
    t.string('pay_tier'); // full | mixed | unpaid — informational, mainly for sick leave
    t.string('status').notNullable().defaultTo('Pending'); // Pending | Approved | Rejected
    t.text('notes');
    t.timestamps(true, true);
    t.index(['company_id', 'employee_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('leave_requests');
};

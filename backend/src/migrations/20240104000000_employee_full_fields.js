/**
 * Remaining fields from the original registry form: statutory/employer
 * GOSI percentages & amounts, payment method + SWIFT, fixed monthly
 * deductions, and attachments (both stored as JSON, same shape the
 * original app kept in localStorage — no separate file storage backend).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('employees', (t) => {
    t.decimal('gosi_emp_pct', 6, 2).notNullable().defaultTo(0);
    t.decimal('gosi_emp', 12, 2).notNullable().defaultTo(0);
    t.decimal('health_ins', 12, 2).notNullable().defaultTo(0);
    t.decimal('income_tax', 12, 2).notNullable().defaultTo(0);
    t.decimal('union_fee', 12, 2).notNullable().defaultTo(0);
    t.decimal('gosi_er_pct', 6, 2).notNullable().defaultTo(0);
    t.decimal('gosi_er', 12, 2).notNullable().defaultTo(0);
    t.decimal('other_er', 12, 2).notNullable().defaultTo(0);
    t.string('pay').notNullable().defaultTo('Transfer'); // Transfer | Cash
    t.string('swift');
    t.text('fixed_deductions'); // JSON: [{description, amount}]
    t.text('attachments'); // JSON: [{name, size, data, uploadedAt}]
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('gosi_emp_pct');
    t.dropColumn('gosi_emp');
    t.dropColumn('health_ins');
    t.dropColumn('income_tax');
    t.dropColumn('union_fee');
    t.dropColumn('gosi_er_pct');
    t.dropColumn('gosi_er');
    t.dropColumn('other_er');
    t.dropColumn('pay');
    t.dropColumn('swift');
    t.dropColumn('fixed_deductions');
    t.dropColumn('attachments');
  });
};

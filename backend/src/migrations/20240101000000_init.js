/**
 * Initial multi-company schema. Written with knex's schema builder only
 * (no raw SQL) so it runs unchanged against SQLite or PostgreSQL.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('companies', (t) => {
    t.increments('id').primary();
    t.string('name_ar').notNullable();
    t.string('name_en').notNullable();
    t.string('logo_data_url');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('full_name').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Roles: owner | admin | hr | finance | viewer — scoped per company, so
  // the same person can hold different roles at different companies.
  await knex.schema.createTable('user_company_roles', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('role').notNullable();
    t.timestamps(true, true);
    t.unique(['user_id', 'company_id']);
  });

  await knex.schema.createTable('branches', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code').notNullable();
    t.string('name_ar').notNullable();
    t.string('name_en');
    t.string('city');
    t.string('region');
    t.string('manager');
    t.string('phone');
    t.string('status').notNullable().defaultTo('Active');
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  await knex.schema.createTable('employees', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('branch_id').references('id').inTable('branches').onDelete('SET NULL');
    t.string('empno');
    t.string('idno');
    t.string('namear').notNullable();
    t.string('nameen');
    t.string('dept');
    t.string('jobar');
    t.string('joben');
    t.decimal('basic', 12, 2).notNullable().defaultTo(0);
    t.decimal('housing', 12, 2).notNullable().defaultTo(0);
    t.decimal('transport', 12, 2).notNullable().defaultTo(0);
    t.decimal('other', 12, 2).notNullable().defaultTo(0);
    t.string('status').notNullable().defaultTo('Active');
    t.date('hire_date');
    t.string('phone');
    t.string('email');
    t.string('bank');
    t.string('iban');
    t.text('notes');
    t.timestamps(true, true);
    t.index(['company_id']);
  });

  // External/outsourced labor — contractors and temp workers under
  // separate contracts, kept out of the regular payroll employee table.
  await knex.schema.createTable('contractors', (t) => {
    t.increments('id').primary();
    t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('name').notNullable();
    t.string('contractor_type').notNullable().defaultTo('individual'); // individual | agency
    t.string('contract_type').notNullable().defaultTo('monthly'); // daily | monthly | project | hourly
    t.decimal('rate', 12, 2).notNullable().defaultTo(0);
    t.string('currency').notNullable().defaultTo('SAR');
    t.string('dept');
    t.string('project');
    t.date('start_date');
    t.date('end_date');
    t.string('phone');
    t.string('email');
    t.string('status').notNullable().defaultTo('Active'); // Active | Completed | Terminated
    t.text('notes');
    t.timestamps(true, true);
    t.index(['company_id']);
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.increments('id').primary();
    t.integer('company_id').references('id').inTable('companies').onDelete('CASCADE');
    t.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('action').notNullable();
    t.string('entity');
    t.integer('entity_id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('contractors');
  await knex.schema.dropTableIfExists('employees');
  await knex.schema.dropTableIfExists('branches');
  await knex.schema.dropTableIfExists('user_company_roles');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('companies');
};

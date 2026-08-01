/**
 * Theme preset + custom print header/footer text, applied to the live UI
 * and to every printed document — same idea as the original's
 * THEME_PRESETS + printSettings, stored per company instead of per browser.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('companies', (t) => {
    t.string('theme').notNullable().defaultTo('navy');
    t.text('print_header_text');
    t.text('print_footer_text');
    t.boolean('print_show_logo').notNullable().defaultTo(true);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('companies', (t) => {
    t.dropColumn('theme');
    t.dropColumn('print_header_text');
    t.dropColumn('print_footer_text');
    t.dropColumn('print_show_logo');
  });
};

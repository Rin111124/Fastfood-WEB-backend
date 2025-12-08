'use strict';

module.exports = {
  async up(qi) {
    const now = new Date();
    const rows = [
      { category_name: 'Burgers', description: 'Banh burger', created_at: now, updated_at: now },
      { category_name: 'Drinks', description: 'Do uong', created_at: now, updated_at: now },
      { category_name: 'Sides', description: 'Mon an kem', created_at: now, updated_at: now },
      { category_name: 'Desserts', description: 'Trang mieng', created_at: now, updated_at: now }
    ];

    const dialect = qi.sequelize.getDialect();

    if (dialect === 'postgres' || dialect === 'postgresql') {
      const values = rows
        .map(
          (r) =>
            `('${r.category_name.replace("'", "''")}', ${r.description ? `'${r.description.replace("'", "''")}'` : 'NULL'}, '${r.created_at.toISOString()}', '${r.updated_at.toISOString()}')`
        )
        .join(', ');

      await qi.sequelize.query(
        `INSERT INTO "products_category" ("category_name","description","created_at","updated_at")
         VALUES ${values}
         ON CONFLICT ("category_name") DO NOTHING;`
      );
    } else {
      await qi.bulkInsert('products_category', rows, { ignoreDuplicates: true });
    }
  },
  async down(qi) {
    await qi.bulkDelete('products_category', null, {});
  }
};

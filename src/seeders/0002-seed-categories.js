'use strict';
module.exports = {
  async up (qi, Sequelize) {
    const now = new Date();
    await qi.bulkInsert('products_category', [
      { category_name: 'Burgers', description: 'Bánh burger', created_at: now, updated_at: now },
      { category_name: 'Drinks', description: 'Đồ uống', created_at: now, updated_at: now },
      { category_name: 'Sides', description: 'Món ăn kèm', created_at: now, updated_at: now },
      { category_name: 'Desserts', description: 'Tráng miệng', created_at: now, updated_at: now }
    ]);
  },
  async down (qi, Sequelize) {
    await qi.bulkDelete('products_category', null, {});
  }
};

'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('products', {
      product_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT },
      price: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
      image_url: { type: Sequelize.STRING(500) },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      category_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'products_category', key: 'category_id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addIndex('products', ['name'], { name:'idx_products_name' });
    await qi.addIndex('products', ['category_id'], { name:'idx_products_category' });
  },
  async down(qi) { await qi.dropTable('products'); }
};

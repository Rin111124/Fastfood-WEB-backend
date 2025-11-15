'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('products_category', {
      category_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      category_name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE
    });
    await qi.addIndex('products_category', ['category_name'], { unique:true, name:'idx_category_name' });
  },
  async down(qi) { await qi.dropTable('products_category'); }
};

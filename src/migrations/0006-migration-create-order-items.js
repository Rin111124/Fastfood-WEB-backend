'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('order_items', {
      order_item_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      order_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'orders', key: 'order_id' },
        onUpdate: 'CASCADE', onDelete:'CASCADE'
      },
      product_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'products', key: 'product_id' },
        onUpdate: 'CASCADE', onDelete:'RESTRICT'
      },
      quantity: { type: Sequelize.INTEGER.UNSIGNED, allowNull:false },
      price: { type: Sequelize.DECIMAL(12,2), allowNull:false },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addIndex('order_items',['order_id'], { name:'idx_order_items_order' });
  },
  async down(qi) { await qi.dropTable('order_items'); }
};

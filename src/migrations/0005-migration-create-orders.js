'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('orders', {
      order_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'users', key:'user_id' },
        onUpdate:'CASCADE', onDelete:'CASCADE'
      },
      total_amount: { type: Sequelize.DECIMAL(12,2), allowNull:false, defaultValue:0 },
      status: { type: Sequelize.ENUM('pending','paid','preparing','shipping','completed','canceled'), defaultValue:'pending' },
      order_date: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      note: { type: Sequelize.STRING(255) },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addIndex('orders',['user_id'], { name:'idx_orders_user' });
    await qi.addIndex('orders',['status'], { name:'idx_orders_status' });
  },
  async down(qi) { await qi.dropTable('orders'); }
};

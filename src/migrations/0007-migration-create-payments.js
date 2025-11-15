'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('payments', {
      payment_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      order_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'orders', key: 'order_id' },
        onUpdate:'CASCADE', onDelete:'CASCADE'
      },
      provider: { type: Sequelize.ENUM('cod','vnpay','momo','paypal'), defaultValue:'cod' },
      amount: { type: Sequelize.DECIMAL(12,2), allowNull:false },
      currency: { type: Sequelize.STRING(10), defaultValue:'VND' },
      txn_ref: { type: Sequelize.STRING(128), unique:true },
      status: { type: Sequelize.ENUM('initiated','success','failed','refunded'), defaultValue:'initiated' },
      meta: { type: Sequelize.JSON },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addIndex('payments',['order_id'], { name:'idx_payments_order' });
    await qi.addIndex('payments',['status'], { name:'idx_payments_status' });
  },
  async down(qi) { await qi.dropTable('payments'); }
};

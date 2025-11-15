'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('cart', {
      cart_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE'
      },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addIndex('cart', ['user_id'], { unique:true, name:'uniq_cart_user' });
  },
  async down(qi) { await qi.dropTable('cart'); }
};

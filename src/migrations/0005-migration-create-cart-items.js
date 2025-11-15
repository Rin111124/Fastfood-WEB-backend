'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('cart_items', {
      cart_item_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      cart_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'cart', key: 'cart_id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE'
      },
      product_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        references: { model: 'products', key: 'product_id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      quantity: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addConstraint('cart_items', {
      type:'unique', fields:['cart_id','product_id'], name:'uniq_cart_product'
    });
  },
  async down(qi) { await qi.dropTable('cart_items'); }
};

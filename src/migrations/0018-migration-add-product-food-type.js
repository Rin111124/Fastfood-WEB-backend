'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'food_type', {
      type: Sequelize.ENUM('burger', 'pizza', 'drink', 'snack', 'combo', 'dessert', 'other'),
      allowNull: false,
      defaultValue: 'other'
    });

    await queryInterface.addIndex('products', ['food_type'], { name: 'idx_products_food_type' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('products', 'idx_products_food_type');
    await queryInterface.removeColumn('products', 'food_type');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_products_food_type\";");
    }
  }
};

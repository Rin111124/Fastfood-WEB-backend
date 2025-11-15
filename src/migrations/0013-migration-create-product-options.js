'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_options', {
      option_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      product_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'products',
          key: 'product_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      group_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      option_name: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      price_adjustment: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      max_select: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
      },
      min_select: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE
    }, { engine: 'InnoDB' });

    await queryInterface.addIndex('product_options', ['product_id'], { name: 'idx_product_options_product' });
    await queryInterface.addIndex('product_options', ['group_name'], { name: 'idx_product_options_group' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('product_options', 'idx_product_options_product');
    await queryInterface.removeIndex('product_options', 'idx_product_options_group');
    await queryInterface.dropTable('product_options');
  }
};

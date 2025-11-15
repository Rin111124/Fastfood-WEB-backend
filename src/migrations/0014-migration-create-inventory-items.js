'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('inventory_items', {
      inventory_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      product_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'products',
          key: 'product_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false
      },
      quantity: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pcs'
      },
      threshold: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      last_restocked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      note: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      updated_by: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL'
      },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE
    }, { engine: 'InnoDB' });

    await queryInterface.addIndex('inventory_items', ['product_id'], { name: 'idx_inventory_product' });
    await queryInterface.addIndex('inventory_items', ['name'], { name: 'idx_inventory_name' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('inventory_items', 'idx_inventory_product');
    await queryInterface.removeIndex('inventory_items', 'idx_inventory_name');
    await queryInterface.dropTable('inventory_items');
  }
};

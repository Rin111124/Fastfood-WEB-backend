'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'assigned_staff_id', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'user_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('orders', 'assigned_shipper_id', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'user_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('orders', 'expected_delivery_time', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('orders', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.changeColumn('orders', 'status', {
      type: Sequelize.ENUM(
        'pending',
        'confirmed',
        'paid',
        'preparing',
        'delivering',
        'shipping',
        'completed',
        'canceled',
        'refunded'
      ),
      allowNull: false,
      defaultValue: 'pending'
    });

    await queryInterface.addIndex('orders', ['assigned_staff_id'], { name: 'idx_orders_staff' });
    await queryInterface.addIndex('orders', ['assigned_shipper_id'], { name: 'idx_orders_shipper' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('orders', 'idx_orders_staff');
    await queryInterface.removeIndex('orders', 'idx_orders_shipper');

    await queryInterface.changeColumn('orders', 'status', {
      type: Sequelize.ENUM('pending', 'paid', 'preparing', 'shipping', 'completed', 'canceled'),
      allowNull: false,
      defaultValue: 'pending'
    });

    await queryInterface.removeColumn('orders', 'completed_at');
    await queryInterface.removeColumn('orders', 'expected_delivery_time');
    await queryInterface.removeColumn('orders', 'assigned_shipper_id');
    await queryInterface.removeColumn('orders', 'assigned_staff_id');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_orders_status\";");
    }
  }
};

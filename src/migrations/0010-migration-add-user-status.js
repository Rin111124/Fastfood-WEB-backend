'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'status', {
      type: Sequelize.ENUM('active', 'locked', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    });

    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('customer', 'admin', 'staff', 'shipper'),
      allowNull: false,
      defaultValue: 'customer'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('customer', 'admin', 'staff'),
      allowNull: false,
      defaultValue: 'customer'
    });

    await queryInterface.removeColumn('users', 'status');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_users_status\";");
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_users_role\";");
    }
  }
};

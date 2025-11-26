'use strict';

const NEW_ROLES = ['customer', 'admin', 'staff', 'shipper', 'guest'];
const OLD_ROLES = ['customer', 'admin', 'staff', 'shipper'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM(...NEW_ROLES),
      allowNull: false,
      defaultValue: 'customer'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM(...OLD_ROLES),
      allowNull: false,
      defaultValue: 'customer'
    });
  }
};

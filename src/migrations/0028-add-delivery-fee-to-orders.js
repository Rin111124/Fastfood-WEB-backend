"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("orders", "delivery_fee", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("orders", "delivery_fee");
  }
};

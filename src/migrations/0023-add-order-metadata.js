"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("orders", "payment_method", {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn("orders", "created_by_employee_id", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true
    });
    await queryInterface.addColumn("orders", "original_amount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("orders", "original_amount");
    await queryInterface.removeColumn("orders", "created_by_employee_id");
    await queryInterface.removeColumn("orders", "payment_method");
  }
};

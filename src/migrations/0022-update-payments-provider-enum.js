"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal','vietqr','stripe') DEFAULT 'cod';"
    );
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal') DEFAULT 'cod';"
    );
  }
};


"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal','vietqr','stripe','cash') DEFAULT 'cod';"
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal','vietqr','stripe') DEFAULT 'cod';"
    );
  }
};

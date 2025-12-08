"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "postgres" || dialect === "postgresql") {
      // Extend existing enum type created by earlier migration
      await queryInterface.sequelize.query(
        'ALTER TYPE "enum_payments_provider" ADD VALUE IF NOT EXISTS \'vietqr\';'
      );
      await queryInterface.sequelize.query(
        'ALTER TYPE "enum_payments_provider" ADD VALUE IF NOT EXISTS \'stripe\';'
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "payments" ALTER COLUMN "provider" SET DEFAULT \'cod\';'
      );
    } else {
      await queryInterface.sequelize.query(
        "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal','vietqr','stripe') DEFAULT 'cod';"
      );
    }
  },
  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "postgres" || dialect === "postgresql") {
      // Remove extra values by recreating the enum type in a transaction
      await queryInterface.sequelize.transaction(async (transaction) => {
        await queryInterface.sequelize.query(
          'ALTER TABLE "payments" ALTER COLUMN "provider" DROP DEFAULT;',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'CREATE TYPE "enum_payments_provider_new" AS ENUM (\'cod\', \'vnpay\', \'momo\', \'paypal\');',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'ALTER TABLE "payments" ALTER COLUMN "provider" TYPE "enum_payments_provider_new" USING "provider"::text::"enum_payments_provider_new";',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'ALTER TABLE "payments" ALTER COLUMN "provider" SET DEFAULT \'cod\';',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'DROP TYPE "enum_payments_provider";',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'ALTER TYPE "enum_payments_provider_new" RENAME TO "enum_payments_provider";',
          { transaction }
        );
      });
    } else {
      await queryInterface.sequelize.query(
        "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal') DEFAULT 'cod';"
      );
    }
  }
};

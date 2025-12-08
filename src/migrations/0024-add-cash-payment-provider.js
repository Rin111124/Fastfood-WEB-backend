"use strict";

module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "postgres" || dialect === "postgresql") {
      await queryInterface.sequelize.query(
        'ALTER TYPE "enum_payments_provider" ADD VALUE IF NOT EXISTS \'cash\';'
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "payments" ALTER COLUMN "provider" SET DEFAULT \'cod\';'
      );
    } else {
      await queryInterface.sequelize.query(
        "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal','vietqr','stripe','cash') DEFAULT 'cod';"
      );
    }
  },
  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "postgres" || dialect === "postgresql") {
      await queryInterface.sequelize.transaction(async (transaction) => {
        await queryInterface.sequelize.query(
          'ALTER TABLE "payments" ALTER COLUMN "provider" DROP DEFAULT;',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'CREATE TYPE "enum_payments_provider_new" AS ENUM (\'cod\', \'vnpay\', \'momo\', \'paypal\', \'vietqr\', \'stripe\');',
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
        "ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('cod','vnpay','momo','paypal','vietqr','stripe') DEFAULT 'cod';"
      );
    }
  }
};

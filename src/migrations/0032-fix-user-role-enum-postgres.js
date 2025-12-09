'use strict';

const NEW_ROLES = ['customer', 'admin', 'staff', 'shipper', 'guest'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres') {
      for (const role of ['shipper', 'guest']) {
        await queryInterface.sequelize.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_type t
              JOIN pg_enum e ON t.oid = e.enumtypid
              WHERE t.typname = 'enum_users_role'
              AND e.enumlabel = '${role}'
            ) THEN
              ALTER TYPE "enum_users_role" ADD VALUE '${role}';
            END IF;
          END$$;
        `);
      }
    }

    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM(...NEW_ROLES),
      allowNull: false,
      defaultValue: 'customer'
    });
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    // Removing enum values in Postgres is destructive; keep shipper to avoid cast failures.
    if (dialect === 'postgres') {
      await queryInterface.changeColumn('users', 'role', {
        type: Sequelize.ENUM('customer', 'admin', 'staff', 'shipper'),
        allowNull: false,
        defaultValue: 'customer'
      });
      return;
    }

    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('customer', 'admin', 'staff', 'shipper'),
      allowNull: false,
      defaultValue: 'customer'
    });
  }
};


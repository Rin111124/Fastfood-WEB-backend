'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      username: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(150),
        allowNull: false,
        unique: true,
      },
      role: {
        type: Sequelize.ENUM('customer', 'admin', 'staff'),
        allowNull: false,
        defaultValue: 'customer',
      },

      // ===== Thông tin cá nhân =====
      full_name: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      phone_number: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      address: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      gender: {
        type: Sequelize.ENUM('male', 'female', 'other', 'unknown'),
        defaultValue: 'unknown',
      },

      // ===== Thời gian hệ thống =====
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE,
    }, { engine: 'InnoDB' });

    // ===== Index =====
    await queryInterface.addIndex('users', ['username'], { unique: true, name: 'idx_users_username' });
    await queryInterface.addIndex('users', ['email'], { unique: true, name: 'idx_users_email' });
    await queryInterface.addIndex('users', ['phone_number'], { name: 'idx_users_phone' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  },
};

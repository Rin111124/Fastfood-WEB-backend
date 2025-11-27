'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });

    // Mark existing users as verified to avoid locking out current accounts
    await queryInterface.sequelize.query(
      'UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL'
    );

    await queryInterface.createTable('email_verification_tokens', {
      token_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'CASCADE'
      },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE },
      ip_address: { type: Sequelize.STRING(45) },
      user_agent: { type: Sequelize.STRING(255) },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_verification_tokens');
    await queryInterface.removeColumn('users', 'email_verified_at');
  }
};

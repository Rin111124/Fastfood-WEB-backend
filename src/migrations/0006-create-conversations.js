'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('conversations', {
      conversation_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'user_id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('open','closed'), allowNull: false, defaultValue: 'open' },
      last_message_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      deleted_at: { type: Sequelize.DATE, allowNull: true }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('conversations');
  }
};


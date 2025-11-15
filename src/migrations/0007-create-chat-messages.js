'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('chat_messages', {
      chat_message_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      conversation_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, references: { model: 'conversations', key: 'conversation_id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      sender_role: { type: Sequelize.ENUM('user','staff','bot'), allowNull: false, defaultValue: 'user' },
      body: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      deleted_at: { type: Sequelize.DATE, allowNull: true }
    });
    await queryInterface.addIndex('chat_messages', ['conversation_id']);
    await queryInterface.addIndex('chat_messages', ['created_at']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('chat_messages');
  }
};


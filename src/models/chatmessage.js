'use strict';
module.exports = (sequelize, DataTypes) => {
  const ChatMessage = sequelize.define('ChatMessage', {
    chat_message_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    conversation_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sender_role: { type: DataTypes.ENUM('user','staff','bot'), allowNull: false, defaultValue: 'user' },
    body: { type: DataTypes.TEXT, allowNull: false }
  }, { tableName: 'chat_messages', underscored: true, timestamps: true, paranoid: true });

  ChatMessage.associate = (models) => {
    ChatMessage.belongsTo(models.Conversation, { foreignKey: 'conversation_id' });
  };

  return ChatMessage;
};


'use strict';
module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define('Conversation', {
    conversation_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    status: { type: DataTypes.ENUM('open','closed'), defaultValue: 'open' },
    last_message_at: { type: DataTypes.DATE, allowNull: true }
  }, { tableName: 'conversations', underscored: true, timestamps: true, paranoid: true });

  Conversation.associate = (models) => {
    Conversation.belongsTo(models.User, { foreignKey: 'user_id' });
    Conversation.hasMany(models.ChatMessage, { foreignKey: 'conversation_id' });
  };

  return Conversation;
};


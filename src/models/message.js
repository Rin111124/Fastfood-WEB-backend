'use strict';
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    message_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    message: { type: DataTypes.TEXT, allowNull:false },
    reply: DataTypes.TEXT,
    sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    channel: { type: DataTypes.ENUM('web','zalo','messenger'), defaultValue:'web' },
    from_role: { type: DataTypes.ENUM('user','bot','staff'), defaultValue:'user' }
  }, { tableName:'messages', underscored:true, timestamps:true, paranoid:true });
  Message.associate = (models) => {
    Message.belongsTo(models.User, { foreignKey:'user_id' });
  };
  return Message;
};

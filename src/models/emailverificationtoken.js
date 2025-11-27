'use strict';
module.exports = (sequelize, DataTypes) => {
  const EmailVerificationToken = sequelize.define(
    'EmailVerificationToken',
    {
      token_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE },
      ip_address: { type: DataTypes.STRING(45) },
      user_agent: { type: DataTypes.STRING(255) }
    },
    {
      tableName: 'email_verification_tokens',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: false
    }
  );

  EmailVerificationToken.associate = (models) => {
    EmailVerificationToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return EmailVerificationToken;
};

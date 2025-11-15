'use strict';
module.exports = (sequelize, DataTypes) => {
  const SystemLog = sequelize.define('SystemLog', {
    log_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    action: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    resource: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    level: {
      type: DataTypes.ENUM('info', 'warning', 'error'),
      allowNull: false,
      defaultValue: 'info'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'system_logs',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  SystemLog.associate = (models) => {
    SystemLog.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return SystemLog;
};

'use strict';
module.exports = (sequelize, DataTypes) => {
  const SystemSetting = sequelize.define('SystemSetting', {
    setting_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    key: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    group: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'general'
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    }
  }, {
    tableName: 'system_settings',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  SystemSetting.associate = (models) => {
    SystemSetting.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
  };

  return SystemSetting;
};

'use strict';
module.exports = (sequelize, DataTypes) => {
  const KitchenStation = sequelize.define(
    'KitchenStation',
    {
      station_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      station_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'custom'
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_pack_station: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      capacity_per_batch: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      display_order: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'kitchen_stations',
      underscored: true,
      timestamps: true,
      paranoid: true
    }
  );

  KitchenStation.associate = (models) => {
    KitchenStation.hasMany(models.Product, {
      foreignKey: 'prep_station_code',
      sourceKey: 'code',
      as: 'products'
    });
    KitchenStation.hasMany(models.StationTask, {
      foreignKey: 'station_code',
      sourceKey: 'code',
      as: 'tasks'
    });
    KitchenStation.hasMany(models.StaffTimeClockEntry, {
      foreignKey: 'station_code',
      sourceKey: 'code',
      as: 'timeclockEntries'
    });
  };

  return KitchenStation;
};

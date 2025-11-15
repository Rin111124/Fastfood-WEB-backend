'use strict';
module.exports = (sequelize, DataTypes) => {
  const StationTask = sequelize.define(
    'StationTask',
    {
      task_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
      },
      order_item_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      station_code: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      station_label_snapshot: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      quantity: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1
      },
      status: {
        type: DataTypes.ENUM('pending', 'acknowledged', 'in_progress', 'completed', 'canceled', 'rerouted'),
        allowNull: false,
        defaultValue: 'pending'
      },
      priority: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      notes: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      expected_prep_seconds: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      acknowledged_by: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      completed_by: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'station_tasks',
      underscored: true,
      timestamps: true,
      paranoid: true
    }
  );

  StationTask.associate = (models) => {
    StationTask.belongsTo(models.Order, { foreignKey: 'order_id' });
    StationTask.belongsTo(models.OrderItem, { foreignKey: 'order_item_id', as: 'orderItem' });
    StationTask.belongsTo(models.KitchenStation, {
      foreignKey: 'station_code',
      targetKey: 'code',
      as: 'station'
    });
    StationTask.belongsTo(models.User, {
      foreignKey: 'acknowledged_by',
      as: 'acknowledgedBy'
    });
    StationTask.belongsTo(models.User, {
      foreignKey: 'completed_by',
      as: 'completedBy'
    });
  };

  return StationTask;
};

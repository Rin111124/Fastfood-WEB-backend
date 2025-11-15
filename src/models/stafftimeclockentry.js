'use strict';
module.exports = (sequelize, DataTypes) => {
  const StaffTimeClockEntry = sequelize.define(
    'StaffTimeClockEntry',
    {
      clock_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      staff_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
      },
      shift_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      station_code: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('on_duty', 'on_break', 'off_duty'),
        allowNull: false,
        defaultValue: 'on_duty'
      },
      check_in_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      check_out_time: {
        type: DataTypes.DATE,
        allowNull: true
      },
      break_started_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      }
    },
    {
      tableName: 'staff_timeclock_entries',
      underscored: true,
      timestamps: true,
      paranoid: true
    }
  );

  StaffTimeClockEntry.associate = (models) => {
    StaffTimeClockEntry.belongsTo(models.User, { foreignKey: 'staff_id', as: 'staff' });
    StaffTimeClockEntry.belongsTo(models.StaffShift, { foreignKey: 'shift_id', as: 'shift' });
    StaffTimeClockEntry.belongsTo(models.KitchenStation, {
      foreignKey: 'station_code',
      targetKey: 'code',
      as: 'station'
    });
  };

  return StaffTimeClockEntry;
};

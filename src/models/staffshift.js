'use strict';
module.exports = (sequelize, DataTypes) => {
  const StaffShift = sequelize.define('StaffShift', {
    shift_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    staff_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    shift_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'completed', 'missed'),
      allowNull: false,
      defaultValue: 'scheduled'
    }
  }, {
    tableName: 'staff_shifts',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  StaffShift.associate = (models) => {
    StaffShift.belongsTo(models.User, { as: 'staff', foreignKey: 'staff_id' });
  };

  return StaffShift;
};

'use strict';
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    user_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(100), allowNull: false, unique: true, validate: { len: [3, 100] } },
    password: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true, validate: { isEmail: true } },
    role: { type: DataTypes.ENUM('customer', 'admin', 'staff', 'shipper'), allowNull: false, defaultValue: 'customer' },
    status: {
      type: DataTypes.ENUM('active', 'locked', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    },
    full_name: {
      type: DataTypes.STRING(120),
      set(v) { this.setDataValue('full_name', v ? v.trim() : null); }
    },
    phone_number: {
      type: DataTypes.STRING(20),
      validate: { is: /^[0-9+()\-\s]{8,20}$/i }
    },
    address: { type: DataTypes.STRING(255) },
    gender: { type: DataTypes.ENUM('male', 'female', 'other', 'unknown'), defaultValue: 'unknown' }
  }, {
    tableName: 'users',
    underscored: true,
    timestamps: true,
    paranoid: true,
    defaultScope: { attributes: { exclude: ['password'] } },
    scopes: { withSecret: {} },
    hooks: {
      beforeCreate(instance) { if (instance.email) instance.email = instance.email.toLowerCase(); },
      beforeUpdate(instance) { if (instance.changed('email') && instance.email) instance.email = instance.email.toLowerCase(); }
    }
  });


  return User;
};

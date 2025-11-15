'use strict';
module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    order_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    user_id: DataTypes.INTEGER.UNSIGNED,
    total_amount: { type: DataTypes.DECIMAL(12,2), allowNull:false },
    delivery_fee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'confirmed',
        'paid',
        'preparing',
        'delivering',
        'shipping',
        'completed',
        'canceled',
        'refunded'
      ),
      defaultValue:'pending'
    },
    assigned_staff_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    assigned_shipper_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    expected_delivery_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    order_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    payment_method: { type: DataTypes.STRING(50), allowNull: true },
    created_by_employee_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    original_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    note: DataTypes.STRING(255)
  }, { tableName:'orders', underscored:true, timestamps:true, paranoid:true });
  Order.associate = (models) => {
    Order.belongsTo(models.User, { foreignKey:'user_id' });
    Order.belongsTo(models.User, { as: 'staff', foreignKey: 'assigned_staff_id' });
    Order.belongsTo(models.User, { as: 'shipper', foreignKey: 'assigned_shipper_id' });
    Order.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by_employee_id' });
    Order.hasMany(models.OrderItem, { foreignKey:'order_id', onDelete:'CASCADE' });
    Order.hasMany(models.Payment, { foreignKey:'order_id' });
  };
  return Order;
};

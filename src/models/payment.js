'use strict';
module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    payment_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    order_id: DataTypes.INTEGER.UNSIGNED,
    provider: { type: DataTypes.ENUM('cod','vnpay','momo','paypal','vietqr','stripe','cash'), defaultValue:'cod' },
    amount: { type: DataTypes.DECIMAL(12,2), allowNull:false },
    currency: { type: DataTypes.STRING(10), defaultValue:'VND' },
    txn_ref: { type: DataTypes.STRING(128), unique:true },
    status: { type: DataTypes.ENUM('initiated','success','failed','refunded'), defaultValue:'initiated' },
    meta: DataTypes.JSON
  }, { tableName:'payments', underscored:true, timestamps:true, paranoid:true });
  Payment.associate = (models) => {
    Payment.belongsTo(models.Order, { foreignKey:'order_id' });
  };
  return Payment;
};

'use strict';
module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define('OrderItem', {
    order_item_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    order_id: DataTypes.INTEGER.UNSIGNED,
    product_id: DataTypes.INTEGER.UNSIGNED,
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull:false },
    price: { type: DataTypes.DECIMAL(12,2), allowNull:false }
  }, { tableName:'order_items', underscored:true, timestamps:true, paranoid:true });
  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, { foreignKey:'order_id' });
    OrderItem.belongsTo(models.Product, { foreignKey:'product_id' });
  };
  return OrderItem;
};

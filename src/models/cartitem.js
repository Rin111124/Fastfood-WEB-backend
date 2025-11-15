'use strict';
module.exports = (sequelize, DataTypes) => {
  const CartItem = sequelize.define('CartItem', {
    cart_item_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    cart_id: DataTypes.INTEGER.UNSIGNED,
    product_id: DataTypes.INTEGER.UNSIGNED,
    quantity: { type: DataTypes.INTEGER.UNSIGNED, defaultValue:1, validate:{ min:1 } }
  }, { tableName:'cart_items', underscored:true, timestamps:true, paranoid:true });
  CartItem.associate = (models) => {
    CartItem.belongsTo(models.Cart, { foreignKey:'cart_id' });
    CartItem.belongsTo(models.Product, { foreignKey:'product_id' });
  };
  return CartItem;
};

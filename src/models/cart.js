'use strict';
module.exports = (sequelize, DataTypes) => {
  const Cart = sequelize.define('Cart', {
    cart_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    user_id: DataTypes.INTEGER.UNSIGNED
  }, { tableName:'cart', underscored:true, timestamps:true, paranoid:true });
  Cart.associate = (models) => {
    Cart.belongsTo(models.User, { foreignKey:'user_id' });
    Cart.hasMany(models.CartItem, { foreignKey:'cart_id', onDelete:'CASCADE' });
  };
  return Cart;
};

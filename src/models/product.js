'use strict';
const { Op } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('Product', {
    product_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    name: { type: DataTypes.STRING(200), allowNull:false },
    description: DataTypes.TEXT,
    food_type: {
      type: DataTypes.ENUM('burger', 'pizza', 'drink', 'snack', 'combo', 'dessert', 'other'),
      allowNull: false,
      defaultValue: 'other'
    },
    prep_station_code: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    price: { type: DataTypes.DECIMAL(12,2), allowNull:false, validate:{ min:0 } },
    image_url: DataTypes.STRING(500),
    image_data: DataTypes.BLOB('long'),
    image_mime: DataTypes.STRING(100),
    is_active: { type: DataTypes.BOOLEAN, defaultValue:true },
    category_id: DataTypes.INTEGER.UNSIGNED
  }, {
    tableName:'products', underscored:true, timestamps:true, paranoid:true,
    defaultScope: { where: { is_active: true } },
    scopes: {
      search(q){ return { where: { name: { [Op.like]: `%${q}%` } } }; },
      byCategory(category_id){ return { where: { category_id } }; }
    }
  });
  Product.associate = (models) => {
    Product.belongsTo(models.ProductCategory, { foreignKey:'category_id' });
    Product.belongsTo(models.KitchenStation, { foreignKey: 'prep_station_code', targetKey: 'code', as: 'station' });
    Product.hasMany(models.CartItem, { foreignKey:'product_id' });
    Product.hasMany(models.OrderItem, { foreignKey:'product_id' });
    Product.hasMany(models.ProductOption, { foreignKey: 'product_id', as: 'options' });
    Product.hasMany(models.InventoryItem, { foreignKey: 'product_id', as: 'inventoryItems' });
  };
  return Product;
};

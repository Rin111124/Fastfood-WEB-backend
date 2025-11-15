'use strict';
module.exports = (sequelize, DataTypes) => {
  const ProductCategory = sequelize.define('ProductCategory', {
    category_id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement:true, primaryKey:true },
    category_name: { type: DataTypes.STRING(120), allowNull:false, unique:true },
    description: DataTypes.TEXT
  }, { tableName:'products_category', underscored:true, timestamps:true, paranoid:true });
  ProductCategory.associate = (models) => {
    ProductCategory.hasMany(models.Product, { foreignKey:'category_id' });
  };
  return ProductCategory;
};

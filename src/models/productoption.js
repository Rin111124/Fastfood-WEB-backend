'use strict';
module.exports = (sequelize, DataTypes) => {
  const ProductOption = sequelize.define('ProductOption', {
    option_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    product_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    group_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    option_name: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    price_adjustment: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    is_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    max_select: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    min_select: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'product_options',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  ProductOption.associate = (models) => {
    ProductOption.belongsTo(models.Product, { foreignKey: 'product_id' });
  };

  return ProductOption;
};

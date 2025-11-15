'use strict';
module.exports = (sequelize, DataTypes) => {
  const InventoryItem = sequelize.define('InventoryItem', {
    inventory_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    product_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pcs'
    },
    threshold: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    last_restocked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    }
  }, {
    tableName: 'inventory_items',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  InventoryItem.associate = (models) => {
    InventoryItem.belongsTo(models.Product, { foreignKey: 'product_id' });
    InventoryItem.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
  };

  return InventoryItem;
};

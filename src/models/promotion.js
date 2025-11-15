'use strict';
module.exports = (sequelize, DataTypes) => {
  const Promotion = sequelize.define('Promotion', {
    promotion_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'percentage'
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    max_discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    min_order_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    max_usage: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    usage_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    applicable_roles: {
      type: DataTypes.JSON,
      allowNull: true
    },
    applicable_categories: {
      type: DataTypes.JSON,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    created_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    }
  }, {
    tableName: 'promotions',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  Promotion.associate = (models) => {
    Promotion.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    Promotion.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
  };

  return Promotion;
};

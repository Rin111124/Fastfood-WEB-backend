'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promotions', {
      promotion_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      discount_type: {
        type: Sequelize.ENUM('percentage', 'fixed'),
        allowNull: false,
        defaultValue: 'percentage'
      },
      discount_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      max_discount_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      min_order_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      max_usage: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
      },
      usage_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      applicable_roles: {
        type: Sequelize.JSON,
        allowNull: true
      },
      applicable_categories: {
        type: Sequelize.JSON,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL'
      },
      updated_by: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL'
      },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE
    }, { engine: 'InnoDB' });

    await queryInterface.addIndex('promotions', ['code'], { unique: true, name: 'idx_promotions_code' });
    await queryInterface.addIndex('promotions', ['is_active'], { name: 'idx_promotions_active' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('promotions', 'idx_promotions_code');
    await queryInterface.removeIndex('promotions', 'idx_promotions_active');
    await queryInterface.dropTable('promotions');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_promotions_discount_type\";");
    }
  }
};

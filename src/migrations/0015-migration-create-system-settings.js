'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_settings', {
      setting_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      key: {
        type: Sequelize.STRING(120),
        allowNull: false,
        unique: true
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      group: {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: 'general'
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
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

    await queryInterface.addIndex('system_settings', ['group'], { name: 'idx_system_settings_group' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('system_settings', 'idx_system_settings_group');
    await queryInterface.dropTable('system_settings');
  }
};

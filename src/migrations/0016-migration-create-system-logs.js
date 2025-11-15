'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_logs', {
      log_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL'
      },
      action: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      resource: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      level: {
        type: Sequelize.ENUM('info', 'warning', 'error'),
        allowNull: false,
        defaultValue: 'info'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE
    }, { engine: 'InnoDB' });

    await queryInterface.addIndex('system_logs', ['resource'], { name: 'idx_system_logs_resource' });
    await queryInterface.addIndex('system_logs', ['action'], { name: 'idx_system_logs_action' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('system_logs', 'idx_system_logs_resource');
    await queryInterface.removeIndex('system_logs', 'idx_system_logs_action');
    await queryInterface.dropTable('system_logs');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_system_logs_level\";");
    }
  }
};

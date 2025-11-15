'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('staff_shifts', {
      shift_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      staff_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      shift_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      start_time: {
        type: Sequelize.TIME,
        allowNull: false
      },
      end_time: {
        type: Sequelize.TIME,
        allowNull: false
      },
      note: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('scheduled', 'completed', 'missed'),
        allowNull: false,
        defaultValue: 'scheduled'
      },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
      deleted_at: Sequelize.DATE
    }, { engine: 'InnoDB' });

    await queryInterface.addIndex('staff_shifts', ['staff_id'], { name: 'idx_staff_shifts_staff' });
    await queryInterface.addIndex('staff_shifts', ['shift_date'], { name: 'idx_staff_shifts_date' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('staff_shifts', 'idx_staff_shifts_staff');
    await queryInterface.removeIndex('staff_shifts', 'idx_staff_shifts_date');
    await queryInterface.dropTable('staff_shifts');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_staff_shifts_status\";");
    }
  }
};

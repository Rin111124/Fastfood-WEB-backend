"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const clockStatusEnum = ["on_duty", "on_break", "off_duty"];
    await queryInterface.createTable(
      "staff_timeclock_entries",
      {
        clock_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true
        },
        staff_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: {
            model: "users",
            key: "user_id"
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        shift_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: {
            model: "staff_shifts",
            key: "shift_id"
          },
          onUpdate: "SET NULL",
          onDelete: "SET NULL"
        },
        station_code: {
          type: Sequelize.STRING(50),
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM(...clockStatusEnum),
          allowNull: false,
          defaultValue: "on_duty"
        },
        check_in_time: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW")
        },
        check_out_time: {
          type: Sequelize.DATE,
          allowNull: true
        },
        break_started_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW")
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW")
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true
        }
      },
      { engine: "InnoDB" }
    );

    await queryInterface.addIndex("staff_timeclock_entries", ["staff_id", "status"], {
      name: "idx_timeclock_staff_status"
    });
    await queryInterface.addIndex("staff_timeclock_entries", ["station_code"], {
      name: "idx_timeclock_station"
    });
    await queryInterface.addIndex("staff_timeclock_entries", ["check_in_time"], {
      name: "idx_timeclock_checkin"
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("staff_timeclock_entries", "idx_timeclock_checkin");
    await queryInterface.removeIndex("staff_timeclock_entries", "idx_timeclock_station");
    await queryInterface.removeIndex("staff_timeclock_entries", "idx_timeclock_staff_status");
    await queryInterface.dropTable("staff_timeclock_entries");
    if (queryInterface.sequelize.getDialect() === "postgres") {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_staff_timeclock_entries_status";');
    }
  }
};

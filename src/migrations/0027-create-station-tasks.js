"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const statusEnum = ["pending", "acknowledged", "in_progress", "completed", "canceled", "rerouted"];
    await queryInterface.createTable(
      "station_tasks",
      {
        task_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true
        },
        order_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: {
            model: "orders",
            key: "order_id"
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        order_item_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: {
            model: "order_items",
            key: "order_item_id"
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        station_code: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        station_label_snapshot: {
          type: Sequelize.STRING(120),
          allowNull: true
        },
        quantity: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 1
        },
        status: {
          type: Sequelize.ENUM(...statusEnum),
          allowNull: false,
          defaultValue: "pending"
        },
        priority: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0
        },
        notes: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        expected_prep_seconds: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true
        },
        acknowledged_by: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: {
            model: "users",
            key: "user_id"
          },
          onUpdate: "SET NULL",
          onDelete: "SET NULL"
        },
        completed_by: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: {
            model: "users",
            key: "user_id"
          },
          onUpdate: "SET NULL",
          onDelete: "SET NULL"
        },
        acknowledged_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        deleted_at: {
          type: Sequelize.DATE,
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
        }
      },
      { engine: "InnoDB" }
    );

    await queryInterface.addIndex("station_tasks", ["station_code", "status"], {
      name: "idx_station_tasks_station_status"
    });
    await queryInterface.addIndex("station_tasks", ["order_id"], {
      name: "idx_station_tasks_order"
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("station_tasks", "idx_station_tasks_order");
    await queryInterface.removeIndex("station_tasks", "idx_station_tasks_station_status");
    await queryInterface.dropTable("station_tasks");
    if (queryInterface.sequelize.getDialect() === "postgres") {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_station_tasks_status";');
    }
  }
};

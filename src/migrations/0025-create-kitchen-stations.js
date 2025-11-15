"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "kitchen_stations",
      {
        station_id: {
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
        station_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: "custom"
        },
        description: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        is_pack_station: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        capacity_per_batch: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true
        },
        display_order: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0
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

    await queryInterface.addIndex("kitchen_stations", ["code"], {
      unique: true,
      name: "uniq_kitchen_stations_code"
    });
    await queryInterface.addIndex("kitchen_stations", ["is_active"], {
      name: "idx_kitchen_stations_active"
    });
    await queryInterface.addIndex("kitchen_stations", ["display_order"], {
      name: "idx_kitchen_stations_display_order"
    });

    const now = new Date();
    await queryInterface.bulkInsert("kitchen_stations", [
      {
        code: "grill",
        name: "Bep Nuong",
        station_type: "prep",
        description: "Chiu trach nhiem cac mon nuong/burger",
        is_active: true,
        is_pack_station: false,
        capacity_per_batch: 4,
        display_order: 10,
        created_at: now,
        updated_at: now
      },
      {
        code: "fryer",
        name: "Bep Chien",
        station_type: "prep",
        description: "Chien gion, khoai tay, ga vien",
        is_active: true,
        is_pack_station: false,
        capacity_per_batch: 6,
        display_order: 20,
        created_at: now,
        updated_at: now
      },
      {
        code: "drink",
        name: "Do Uong",
        station_type: "drink",
        description: "Pha che do uong",
        is_active: true,
        is_pack_station: false,
        capacity_per_batch: 8,
        display_order: 30,
        created_at: now,
        updated_at: now
      },
      {
        code: "pack",
        name: "Dong Goi",
        station_type: "pack",
        description: "Dong goi & goi so",
        is_active: true,
        is_pack_station: true,
        capacity_per_batch: 3,
        display_order: 40,
        created_at: now,
        updated_at: now
      }
    ]);

    await queryInterface.addColumn("products", "prep_station_code", {
      type: Sequelize.STRING(50),
      allowNull: true,
      after: "food_type"
    });
    await queryInterface.addIndex("products", ["prep_station_code"], {
      name: "idx_products_prep_station_code"
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("products", "idx_products_prep_station_code");
    await queryInterface.removeColumn("products", "prep_station_code");
    await queryInterface.removeIndex("kitchen_stations", "idx_kitchen_stations_display_order");
    await queryInterface.removeIndex("kitchen_stations", "idx_kitchen_stations_active");
    await queryInterface.removeIndex("kitchen_stations", "uniq_kitchen_stations_code");
    await queryInterface.bulkDelete("kitchen_stations", null, { truncate: true });
    await queryInterface.dropTable("kitchen_stations");
  }
};

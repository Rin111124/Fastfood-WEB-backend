"use strict";

module.exports = {
  async up(qi, Sequelize) {
    const table = await qi.describeTable("products");

    if (!table.image_data) {
      await qi.addColumn("products", "image_data", {
        type: Sequelize.BLOB("long"),
        allowNull: true
      });
    }

    if (!table.image_mime) {
      await qi.addColumn("products", "image_mime", {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }
  },

  async down(qi) {
    const table = await qi.describeTable("products");
    if (table.image_mime) {
      await qi.removeColumn("products", "image_mime");
    }
    if (table.image_data) {
      await qi.removeColumn("products", "image_data");
    }
  }
};

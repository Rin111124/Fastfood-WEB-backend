"use strict";

module.exports = {
  async up(qi, Sequelize) {
    const table = await qi.describeTable("news");

    if (!table.image_data) {
      await qi.addColumn("news", "image_data", {
        type: Sequelize.BLOB("long"),
        allowNull: true
      });
    }

    if (!table.image_mime) {
      await qi.addColumn("news", "image_mime", {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }
  },

  async down(qi) {
    const table = await qi.describeTable("news");
    if (table.image_mime) {
      await qi.removeColumn("news", "image_mime");
    }
    if (table.image_data) {
      await qi.removeColumn("news", "image_data");
    }
  }
};

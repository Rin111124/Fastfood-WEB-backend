'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('news', {
      news_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      title: { type: Sequelize.STRING(200), allowNull:false },
      content: { type: Sequelize.TEXT('long') },
      image_url: { type: Sequelize.STRING(500) },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
  },
  async down(qi) { await qi.dropTable('news'); }
};

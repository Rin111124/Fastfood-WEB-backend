'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('messages', {
      message_id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model:'users', key:'user_id' },
        onUpdate:'CASCADE', onDelete:'SET NULL'
      },
      message: { type: Sequelize.TEXT, allowNull:false },
      reply: { type: Sequelize.TEXT },
      sent_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      channel: { type: Sequelize.ENUM('web','zalo','messenger'), defaultValue:'web' },
      from_role: { type: Sequelize.ENUM('user','bot','staff'), defaultValue:'user' },
      created_at: Sequelize.DATE, updated_at: Sequelize.DATE, deleted_at: Sequelize.DATE
    });
    await qi.addIndex('messages',['user_id'], { name:'idx_messages_user' });
    await qi.addIndex('messages',['sent_at'], { name:'idx_messages_time' });
  },
  async down(qi) { await qi.dropTable('messages'); }
};

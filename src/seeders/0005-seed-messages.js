'use strict';
module.exports = {
  async up (qi, Sequelize) {
    const now = new Date();
    // get alice user_id
    const [users] = await qi.sequelize.query("SELECT user_id, username FROM users WHERE username='alice';");
    const alice = users[0];
    await qi.bulkInsert('messages', [
      { user_id: alice ? alice.user_id : null, message: 'Quán mở cửa lúc mấy giờ?', reply: 'Từ 8:00 đến 22:00 mỗi ngày.', sent_at: now, channel: 'web', from_role: 'user', created_at: now, updated_at: now },
    ]);
  },
  async down (qi, Sequelize) {
    await qi.bulkDelete('messages', null, {});
  }
};

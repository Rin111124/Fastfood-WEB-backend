'use strict';
const bcrypt = require('bcryptjs');
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const salt = bcrypt.genSaltSync(10);
    const users = [
      {
        username: 'admin',
        password: bcrypt.hashSync('Admin@123', salt),
        email: 'admin@fastfood.local',
        full_name: 'Administrator',
        role: 'admin',
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        username: 'alice',
        password: bcrypt.hashSync('alice123', salt),
        email: 'alice@example.com',
        full_name: 'Alice Customer',
        role: 'customer',
        status: 'active',
        created_at: now,
        updated_at: now
      }
    ];

    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres' || dialect === 'postgresql') {
      const values = users
        .map(
          (u) =>
            `('${u.username.replace("'", "''")}', '${u.password}', '${u.email.replace("'", "''")}', '${u.full_name.replace("'", "''")}', '${u.role}', '${u.status}', '${u.created_at.toISOString()}', '${u.updated_at.toISOString()}')`
        )
        .join(', ');
      await queryInterface.sequelize.query(
        `INSERT INTO "users" ("username","password","email","full_name","role","status","created_at","updated_at")
         VALUES ${values}
         ON CONFLICT ("username") DO NOTHING;`
      );
    } else {
      await queryInterface.bulkInsert('users', users, { ignoreDuplicates: true });
    }
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', { username: ['admin', 'alice'] });
  }
};

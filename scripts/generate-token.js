import 'dotenv/config.js';
import db from './src/models/index.js';
import jwt from 'jsonwebtoken';

const { User } = db;

async function generateTestToken() {
    try {
        await db.sequelize.authenticate();
        console.log('✅ Database connected');

        // Find customer
        const customer = await User.findOne({
            where: { role: 'customer' }
        });

        if (!customer) {
            console.log('❌ No customer found');
            return;
        }

        console.log(`✅ Customer: ${customer.username} (ID: ${customer.user_id})`);

        // Generate JWT token
        const token = jwt.sign(
            {
                user_id: customer.user_id,
                userId: customer.user_id,
                username: customer.username,
                role: customer.role
            },
            process.env.JWT_SECRET || 'your-secret-key',
            {
                expiresIn: '24h',
                issuer: process.env.JWT_ISSUER || 'fatfood-api'
            }
        );

        console.log(`\n🔑 JWT Token:`);
        console.log(token);

        console.log(`\n📝 Test with curl:`);
        console.log(`curl -X POST http://localhost:3000/api/customer/cart/items \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -H "Authorization: Bearer ${token}" \\`);
        console.log(`  -d "{\\"productId\\": 10, \\"quantity\\": 1}"`);

        console.log(`\n📝 Or test GET cart:`);
        console.log(`curl http://localhost:3000/api/customer/cart \\`);
        console.log(`  -H "Authorization: Bearer ${token}"`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await db.sequelize.close();
    }
}

generateTestToken();

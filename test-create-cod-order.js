import 'dotenv/config.js';
import db from './src/models/index.js';
import { createOrderForCustomer } from './src/modules/customer/customer.service.js';

const { sequelize, User, Product } = db;

async function testCreateCODOrder() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected\n');

        // Find customer
        const customer = await User.findOne({
            where: { role: 'customer' }
        });

        if (!customer) {
            console.log('❌ No customer found');
            return;
        }

        console.log(`✅ Customer: ${customer.username} (ID: ${customer.user_id})`);

        // Find products
        const products = await Product.findAll({
            where: { is_active: true },
            limit: 2
        });

        if (products.length === 0) {
            console.log('❌ No products found');
            return;
        }

        console.log(`✅ Found ${products.length} products\n`);

        // Create COD order
        console.log('📦 Creating COD order...');
        const orderPayload = {
            items: products.map(p => ({
                product_id: p.product_id,
                quantity: 1
            })),
            payment_method: 'cod',
            note: 'Test order for staff assignment'
        };

        const order = await createOrderForCustomer(customer.user_id, orderPayload);

        console.log('\n✅ Order created successfully!');
        console.log(`   Order ID: ${order.order_id}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Assigned Staff: ${order.assigned_staff_id || 'NONE'}`);
        console.log(`   Payment Method: ${order.payment_method}`);
        console.log(`   Total: ${order.total_amount}`);

        if (order.assigned_staff_id) {
            const staff = await User.findByPk(order.assigned_staff_id);
            console.log(`   Staff Name: ${staff?.full_name || staff?.username}`);
            console.log('\n🎉 Staff assignment successful!');
        } else {
            console.log('\n⚠️  Staff not assigned - check shift and timeclock');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

testCreateCODOrder();

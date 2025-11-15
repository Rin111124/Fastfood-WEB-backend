import 'dotenv/config.js';
import db from './src/models/index.js';

const { User, Product, Cart, CartItem } = db;

async function testAddToCart() {
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

        // Find product
        const product = await Product.findOne({
            where: { is_active: true }
        });

        if (!product) {
            console.log('❌ No active product found');
            return;
        }

        console.log(`✅ Product: ${product.name} (ID: ${product.product_id}, Price: ${product.price})`);

        // Get or create cart
        let cart = await Cart.findOne({ where: { user_id: customer.user_id } });
        if (!cart) {
            cart = await Cart.create({ user_id: customer.user_id });
            console.log(`✅ Cart created (ID: ${cart.cart_id})`);
        } else {
            console.log(`✅ Cart exists (ID: ${cart.cart_id})`);
        }

        // Add item to cart
        const [item, created] = await CartItem.findOrCreate({
            where: { cart_id: cart.cart_id, product_id: product.product_id },
            defaults: { quantity: 1 }
        });

        if (created) {
            console.log(`✅ Cart item created: ${product.name} x1`);
        } else {
            await item.update({ quantity: (Number(item.quantity) || 0) + 1 });
            console.log(`✅ Cart item updated: ${product.name} x${item.quantity}`);
        }

        // List cart
        const items = await CartItem.findAll({
            where: { cart_id: cart.cart_id },
            include: [{ model: Product }]
        });

        console.log('\n📦 Current cart:');
        items.forEach((row) => {
            const plain = row.get({ plain: true });
            console.log(`   - ${plain.Product.name} x${plain.quantity} = $${plain.Product.price * plain.quantity}`);
        });

        const subtotal = items.reduce((sum, row) => {
            return sum + (Number(row.Product.price) * Number(row.quantity));
        }, 0);

        console.log(`\n💰 Subtotal: $${subtotal}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.sequelize.close();
    }
}

testAddToCart();

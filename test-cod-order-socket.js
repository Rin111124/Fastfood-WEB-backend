import sequelize from './src/config/connectDB.js'
import { createOrderForCustomer } from './src/modules/customer/customer.service.js'

const testCreateCODOrderWithSocket = async () => {
    try {
        console.log('🧪 Testing COD order creation with Socket.IO notifications...\n')

        const userId = 1 // Customer account
        const orderPayload = {
            payment_method: 'cod',
            note: 'Test COD order with Socket notifications',
            items: [
                { product_id: 1, quantity: 2, price: 45000 },
                { product_id: 2, quantity: 1, price: 60000 }
            ]
        }

        console.log('📦 Creating COD order...')
        console.log('Payload:', JSON.stringify(orderPayload, null, 2))

        const order = await createOrderForCustomer(userId, orderPayload)

        console.log('\n✅ Order created successfully!')
        console.log('Order ID:', order.order_id)
        console.log('Status:', order.status)
        console.log('Payment Method:', order.payment_method)
        console.log('Total Amount:', order.total_amount)

        console.log('\n🔍 Check server logs for Socket.IO emissions:')
        console.log('  - "order:assigned" sent to staff ID:', order.assigned_staff_id || 'N/A')
        console.log('  - "kds:tasks:created" broadcast to all staff')

        console.log('\n🖥️  Check browser console for staff dashboard:')
        console.log('  - Should see: 🆕 New order assigned: {...}')
        console.log('  - Should see: 🍳 New KDS tasks: {...}')
        console.log('  - Dashboard should reload and show the new order')

    } catch (error) {
        console.error('\n❌ Error:', error.message)
        if (error.stack) console.error(error.stack)
    } finally {
        await sequelize.close()
    }
}

testCreateCODOrderWithSocket()

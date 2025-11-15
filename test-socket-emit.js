import { emitToStaff } from './src/realtime/io.js'

console.log('Testing Socket.IO emit manually...')

// Test broadcast to all staff
console.log('\n1. Broadcasting to all staff:')
emitToStaff('kds:tasks:created', {
    order_id: 999,
    station_codes: ['grill', 'fryer'],
    assigned_staff_id: 4
})
console.log('✅ Broadcasted kds:tasks:created to all staff')

// Test emit to specific staff
console.log('\n2. Emitting to specific staff (ID: 4):')
emitToStaff('order:assigned', {
    order_id: 999,
    staff_id: 4,
    total_amount: 150000,
    status: 'preparing'
}, 4)
console.log('✅ Emitted order:assigned to staff ID 4')

console.log('\n3. Emitting to specific staff (ID: 9):')
emitToStaff('order:assigned', {
    order_id: 999,
    staff_id: 9,
    total_amount: 150000,
    status: 'preparing'
}, 9)
console.log('✅ Emitted order:assigned to staff ID 9')

console.log('\n⚠️  Lưu ý: Server phải đang chạy và có staff connected thì mới nhận được events')
console.log('Kiểm tra console của browser để xem có log không:')
console.log('  - 🍳 New KDS tasks: {...}')
console.log('  - 🆕 New order assigned: {...}')

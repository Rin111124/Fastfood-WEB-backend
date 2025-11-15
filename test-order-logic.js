import 'dotenv/config.js';
import db from './src/models/index.js';
import { assignOrderToOnDutyStaff } from './src/modules/order/orderAssignment.helper.js';
import { prepareOrderForFulfillment } from './src/modules/order/orderFulfillment.service.js';

const { sequelize, Order, User, StaffShift, StaffTimeClockEntry } = db;

async function testOrderAssignmentLogic() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected\n');

        // 1. Kiểm tra staff có trực không
        console.log('📋 Step 1: Checking staff availability...');
        const staff = await User.findOne({
            where: { role: 'staff', status: 'active' }
        });

        if (!staff) {
            console.log('❌ No active staff found!');
            return;
        }
        console.log(`✅ Staff found: ${staff.username} (ID: ${staff.user_id})\n`);

        // 2. Kiểm tra shift
        console.log('📋 Step 2: Checking staff shift...');
        const now = new Date();
        const currentDate = now.toISOString().slice(0, 10);
        const currentTime = now.toTimeString().slice(0, 8);

        const shift = await StaffShift.findOne({
            where: {
                staff_id: staff.user_id,
                shift_date: currentDate,
                status: 'scheduled'
            }
        });

        if (shift) {
            console.log(`✅ Shift found: ${shift.start_time} - ${shift.end_time}`);
            console.log(`   Current time: ${currentTime}`);
            console.log(`   In shift range: ${shift.start_time <= currentTime && shift.end_time >= currentTime ? '✅ YES' : '❌ NO'}\n`);
        } else {
            console.log('⚠️  No shift found for today\n');
        }

        // 3. Kiểm tra timeclock entry
        console.log('📋 Step 3: Checking timeclock entry...');
        const timeclock = await StaffTimeClockEntry.findOne({
            where: {
                staff_id: staff.user_id,
                status: 'on_duty',
                check_out_time: null
            }
        });

        if (timeclock) {
            console.log(`✅ Timeclock found: ${timeclock.station_code || 'no station'}`);
            console.log(`   Check in: ${timeclock.check_in_time}`);
            console.log(`   Status: ${timeclock.status}\n`);
        } else {
            console.log('⚠️  No active timeclock entry\n');
        }

        // 4. Tìm đơn hàng pending để test
        console.log('📋 Step 4: Finding pending orders...');
        const pendingOrders = await Order.findAll({
            where: { status: 'pending' },
            limit: 3,
            order: [['created_at', 'DESC']]
        });

        console.log(`Found ${pendingOrders.length} pending orders\n`);

        if (pendingOrders.length === 0) {
            console.log('ℹ️  No pending orders to test. Try creating an order from frontend.\n');
            return;
        }

        // 5. Test assignment logic trên từng đơn
        console.log('📋 Step 5: Testing assignment logic...\n');

        for (const order of pendingOrders) {
            console.log(`\n🔍 Testing Order #${order.order_id}:`);
            console.log(`   Status: ${order.status}`);
            console.log(`   Assigned staff: ${order.assigned_staff_id || 'NONE'}`);
            console.log(`   Payment method: ${order.payment_method}`);

            // Test assignOrderToOnDutyStaff
            await sequelize.transaction(async (t) => {
                const assignedStaffId = await assignOrderToOnDutyStaff(order, { transaction: t });

                if (assignedStaffId) {
                    console.log(`   ✅ Assignment successful → Staff ID: ${assignedStaffId}`);

                    // Reload order to see changes
                    await order.reload({ transaction: t });
                    console.log(`   ✅ Order updated → assigned_staff_id: ${order.assigned_staff_id}`);
                } else {
                    console.log(`   ❌ Assignment failed - no staff available`);
                }
            });
        }

        // 6. Test prepareOrderForFulfillment với COD order
        console.log('\n\n📋 Step 6: Testing prepareOrderForFulfillment...');
        const codOrder = await Order.findOne({
            where: {
                payment_method: 'cod',
                status: 'pending'
            },
            order: [['created_at', 'DESC']]
        });

        if (codOrder) {
            console.log(`\n🔍 Testing COD Order #${codOrder.order_id}:`);
            console.log(`   Status before: ${codOrder.status}`);
            console.log(`   Assigned staff before: ${codOrder.assigned_staff_id || 'NONE'}`);

            await sequelize.transaction(async (t) => {
                const result = await prepareOrderForFulfillment(codOrder, { transaction: t });

                await codOrder.reload({ transaction: t });

                console.log(`\n   ✅ Fulfillment prepared:`);
                console.log(`      Status after: ${codOrder.status}`);
                console.log(`      Assigned staff: ${result.staffId || 'NONE'}`);
                console.log(`      Tasks created: ${result.tasks?.length || 0}`);
            });
        } else {
            console.log('   ℹ️  No COD pending orders to test');
        }

        // 7. Summary
        console.log('\n\n📊 SUMMARY:');
        console.log('='.repeat(50));
        console.log(`Staff available: ${staff ? '✅' : '❌'}`);
        console.log(`Shift active: ${shift && shift.start_time <= currentTime && shift.end_time >= currentTime ? '✅' : '❌'}`);
        console.log(`Timeclock on_duty: ${timeclock ? '✅' : '❌'}`);
        console.log(`Pending orders: ${pendingOrders.length}`);
        console.log('='.repeat(50));

        console.log('\n💡 RECOMMENDATION:');
        if (!shift || shift.start_time > currentTime || shift.end_time < currentTime) {
            console.log('⚠️  Create shift covering current time:');
            console.log(`   INSERT INTO staff_shifts (staff_id, shift_date, start_time, end_time, status)`);
            console.log(`   VALUES (${staff.user_id}, '${currentDate}', '08:00:00', '22:00:00', 'scheduled');`);
        }

        if (!timeclock) {
            console.log('⚠️  Staff should check in:');
            console.log(`   INSERT INTO staff_timeclock_entries (staff_id, station_code, status, check_in_time)`);
            console.log(`   VALUES (${staff.user_id}, 'grill', 'on_duty', NOW());`);
        }

        if (shift && timeclock) {
            console.log('✅ All systems ready! Orders will be auto-assigned to staff.');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

testOrderAssignmentLogic();

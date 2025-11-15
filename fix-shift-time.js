import 'dotenv/config.js';
import db from './src/models/index.js';

const { sequelize, StaffShift } = db;

async function updateShiftTime() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const today = new Date().toISOString().slice(0, 10);

        // Update shift to cover 24 hours
        const [updated] = await StaffShift.update(
            {
                start_time: '00:00:00',
                end_time: '23:59:59'
            },
            {
                where: {
                    staff_id: 4,
                    shift_date: today
                }
            }
        );

        if (updated > 0) {
            console.log(`✅ Updated shift to 00:00:00 - 23:59:59`);
        } else {
            console.log('ℹ️  Creating new shift...');
            await StaffShift.create({
                staff_id: 4,
                shift_date: today,
                start_time: '00:00:00',
                end_time: '23:59:59',
                status: 'scheduled'
            });
            console.log('✅ Created 24-hour shift');
        }

        // Verify
        const shift = await StaffShift.findOne({
            where: { staff_id: 4, shift_date: today }
        });

        if (shift) {
            console.log(`\n📋 Current shift:`);
            console.log(`   Date: ${shift.shift_date}`);
            console.log(`   Time: ${shift.start_time} - ${shift.end_time}`);
            console.log(`   Status: ${shift.status}`);

            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 8);
            const inRange = shift.start_time <= currentTime && shift.end_time >= currentTime;
            console.log(`   Current time: ${currentTime}`);
            console.log(`   In range: ${inRange ? '✅ YES' : '❌ NO'}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

updateShiftTime();

import 'dotenv/config.js';
import db from './src/models/index.js';

const { sequelize, StaffShift } = db;

async function updateShiftDate() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const today = new Date().toISOString().slice(0, 10);
        console.log(`Today: ${today}`);

        // Update shift date
        const [updated] = await StaffShift.update(
            { shift_date: today },
            {
                where: {
                    staff_id: 4,
                    shift_date: '2025-11-14'
                }
            }
        );

        if (updated > 0) {
            console.log(`✅ Updated ${updated} shift(s) to today's date`);
        } else {
            console.log('ℹ️  No shifts to update, creating new one...');

            await StaffShift.create({
                staff_id: 4,
                shift_date: today,
                start_time: '00:00:00',
                end_time: '23:59:59',
                status: 'scheduled'
            });

            console.log('✅ Created new shift for today (00:00 - 23:59)');
        }

        // Show current shifts
        const shifts = await StaffShift.findAll({
            where: { staff_id: 4 },
            order: [['shift_date', 'DESC']],
            limit: 3
        });

        console.log('\n📋 Current shifts:');
        shifts.forEach(s => {
            console.log(`   ${s.shift_date} | ${s.start_time} - ${s.end_time} | ${s.status}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

updateShiftDate();

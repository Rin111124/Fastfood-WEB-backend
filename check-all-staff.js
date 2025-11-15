import 'dotenv/config.js';
import db from './src/models/index.js';

const { sequelize, User, StaffShift, StaffTimeClockEntry } = db;

async function checkAllStaff() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected\n');

        // Find all staff
        const allStaff = await User.findAll({
            where: { role: 'staff' },
            order: [['user_id', 'ASC']]
        });

        console.log(`📋 Found ${allStaff.length} staff members:\n`);

        const today = new Date().toISOString().slice(0, 10);
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8);

        for (const staff of allStaff) {
            console.log(`\n👤 Staff: ${staff.full_name || staff.username} (ID: ${staff.user_id})`);
            console.log(`   Status: ${staff.status}`);
            console.log(`   Email: ${staff.email}`);

            // Check shift
            const shift = await StaffShift.findOne({
                where: {
                    staff_id: staff.user_id,
                    shift_date: today
                }
            });

            if (shift) {
                const inRange = shift.start_time <= currentTime && shift.end_time >= currentTime;
                console.log(`   📅 Shift: ${shift.start_time} - ${shift.end_time} (${shift.status})`);
                console.log(`   ⏰ In shift range: ${inRange ? '✅ YES' : '❌ NO'}`);
            } else {
                console.log(`   ⚠️  No shift today`);
            }

            // Check timeclock
            const timeclock = await StaffTimeClockEntry.findOne({
                where: {
                    staff_id: staff.user_id,
                    status: 'on_duty',
                    check_out_time: null
                }
            });

            if (timeclock) {
                console.log(`   🕐 Checked in: ${timeclock.check_in_time}`);
                console.log(`   🏪 Station: ${timeclock.station_code || 'none'}`);
                console.log(`   ✅ Currently on duty`);
            } else {
                console.log(`   ❌ Not checked in`);
            }
        }

        console.log('\n\n📊 SUMMARY:');
        console.log('='.repeat(60));
        console.log(`Current date: ${today}`);
        console.log(`Current time: ${currentTime}`);
        console.log(`Total staff: ${allStaff.length}`);

        const activeStaff = [];
        for (const staff of allStaff) {
            const shift = await StaffShift.findOne({
                where: { staff_id: staff.user_id, shift_date: today }
            });
            const timeclock = await StaffTimeClockEntry.findOne({
                where: {
                    staff_id: staff.user_id,
                    status: 'on_duty',
                    check_out_time: null
                }
            });

            if (timeclock) {
                activeStaff.push({
                    id: staff.user_id,
                    name: staff.full_name || staff.username,
                    station: timeclock.station_code,
                    hasShift: !!shift
                });
            }
        }

        console.log(`On duty staff: ${activeStaff.length}`);
        console.log('='.repeat(60));

        if (activeStaff.length > 0) {
            console.log('\n✅ Staff ready to receive orders:');
            activeStaff.forEach(s => {
                console.log(`   • ${s.name} (ID: ${s.id}) at ${s.station || 'no station'} ${s.hasShift ? '✓' : '⚠️ no shift'}`);
            });
        } else {
            console.log('\n⚠️  No staff currently on duty!');
        }

        // Recommendations
        console.log('\n\n💡 RECOMMENDATIONS:');
        const inactiveStaff = allStaff.filter(s => {
            return !activeStaff.find(a => a.id === s.user_id);
        });

        if (inactiveStaff.length > 0) {
            console.log('\n📝 Create shifts and check-in for inactive staff:');
            for (const staff of inactiveStaff) {
                console.log(`\n-- Staff: ${staff.full_name || staff.username} (ID: ${staff.user_id})`);
                console.log(`-- Shift:`);
                console.log(`INSERT INTO staff_shifts (staff_id, shift_date, start_time, end_time, status)`);
                console.log(`VALUES (${staff.user_id}, '${today}', '00:00:00', '23:59:59', 'scheduled');`);
                console.log(`-- Check-in:`);
                console.log(`INSERT INTO staff_timeclock_entries (staff_id, station_code, status, check_in_time)`);
                console.log(`VALUES (${staff.user_id}, 'grill', 'on_duty', NOW());`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

checkAllStaff();

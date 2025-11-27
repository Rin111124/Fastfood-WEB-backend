import 'dotenv/config.js';
import db from './src/models/index.js';

const { sequelize, User, StaffShift, StaffTimeClockEntry } = db;

const stations = ['grill', 'fryer', 'assembly', 'drinks'];

async function setupAllStaff() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected\n');

        const today = new Date().toISOString().slice(0, 10);

        // Get all active staff
        const allStaff = await User.findAll({
            where: {
                role: 'staff',
                status: 'active'
            },
            order: [['user_id', 'ASC']]
        });

        console.log(`📋 Setting up ${allStaff.length} staff members...\n`);

        let setupCount = 0;
        for (let i = 0; i < allStaff.length; i++) {
            const staff = allStaff[i];
            const station = stations[i % stations.length]; // Rotate stations

            console.log(`👤 ${staff.full_name || staff.username} (ID: ${staff.user_id})`);

            // Create or update shift
            const [shift, shiftCreated] = await StaffShift.findOrCreate({
                where: {
                    staff_id: staff.user_id,
                    shift_date: today
                },
                defaults: {
                    start_time: '00:00:00',
                    end_time: '23:59:59',
                    status: 'scheduled',
                    note: 'Auto-generated 24h shift'
                }
            });

            if (!shiftCreated) {
                await shift.update({
                    start_time: '00:00:00',
                    end_time: '23:59:59',
                    status: 'scheduled'
                });
                console.log(`   ✅ Shift updated: 00:00 - 23:59`);
            } else {
                console.log(`   ✅ Shift created: 00:00 - 23:59`);
            }

            // Check if already checked in
            const existingClock = await StaffTimeClockEntry.findOne({
                where: {
                    staff_id: staff.user_id,
                    status: 'on_duty',
                    check_out_time: null
                }
            });

            if (existingClock) {
                console.log(`   ℹ️  Already checked in at ${existingClock.station_code}`);
            } else {
                // Create timeclock entry
                await StaffTimeClockEntry.create({
                    staff_id: staff.user_id,
                    shift_id: shift.shift_id,
                    station_code: station,
                    status: 'on_duty',
                    check_in_time: new Date()
                });
                console.log(`   ✅ Checked in at station: ${station}`);
                setupCount++;
            }

            console.log('');
        }

        // Verify setup
        console.log('\n📊 VERIFICATION:');
        console.log('='.repeat(60));

        const onDutyStaff = await StaffTimeClockEntry.findAll({
            where: {
                status: 'on_duty',
                check_out_time: null
            },
            include: [{
                model: User,
                attributes: ['user_id', 'username', 'full_name']
            }]
        });

        console.log(`✅ ${onDutyStaff.length} staff currently on duty:\n`);

        onDutyStaff.forEach((clock, index) => {
            const staffName = clock.User?.full_name || clock.User?.username || 'Unknown';
            console.log(`   ${index + 1}. ${staffName} (ID: ${clock.staff_id}) @ ${clock.station_code}`);
        });

        console.log('\n' + '='.repeat(60));
        console.log(`✅ Setup complete! ${setupCount} new staff checked in.`);
        console.log(`📢 Orders will be distributed among ${onDutyStaff.length} on-duty staff.`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

setupAllStaff();

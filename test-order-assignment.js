require('dotenv').config();
const db = require('./src/models');

async function setupTestData() {
    try {
        await db.sequelize.authenticate();
        console.log('✅ Database connected');

        // 1. Find staff user
        const staff = await db.User.findOne({ where: { role: 'staff' } });
        if (!staff) {
            console.log('❌ No staff user found. Please create one first.');
            process.exit(1);
        }
        console.log(`✅ Found staff: ${staff.username} (ID: ${staff.user_id})`);

        // 2. Create shift for today
        const today = new Date().toISOString().split('T')[0];
        const existingShift = await db.StaffShift.findOne({
            where: { staff_id: staff.user_id, shift_date: today }
        });

        if (existingShift) {
            console.log(`✅ Shift already exists for today: ${existingShift.start_time} - ${existingShift.end_time}`);
        } else {
            const shift = await db.StaffShift.create({
                staff_id: staff.user_id,
                shift_date: today,
                start_time: '08:00:00',
                end_time: '22:00:00',
                status: 'scheduled',
                note: 'Test shift for order assignment'
            });
            console.log(`✅ Created shift: ${shift.start_time} - ${shift.end_time}`);
        }

        // 3. Create timeclock entry (staff checked in)
        const activeEntry = await db.StaffTimeClockEntry.findOne({
            where: {
                staff_id: staff.user_id,
                status: 'on_duty',
                check_out_time: null
            }
        });

        if (activeEntry) {
            console.log(`✅ Staff already checked in at station: ${activeEntry.station_code || 'general'}`);
        } else {
            const entry = await db.StaffTimeClockEntry.create({
                staff_id: staff.user_id,
                status: 'on_duty',
                station_code: 'grill',
                check_in_time: new Date()
            });
            console.log(`✅ Staff checked in at station: ${entry.station_code}`);
        }

        console.log('\n🎉 Setup complete! You can now test order assignment.');
        console.log('   - Staff will be auto-assigned to new orders');
        console.log('   - Orders created via COD will trigger assignment');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await db.sequelize.close();
    }
}

setupTestData();

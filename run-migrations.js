import dotenv from 'dotenv'
import sequelize from './src/config/connectDB.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const runAllMigrations = async () => {
    try {
        console.log('🔄 Starting database migrations...\n')

        // Connect to database
        const db = await sequelize()
        console.log('✅ Database connected\n')

        // Get all migration files
        const migrationsDir = join(__dirname, 'src', 'migrations')
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.js'))
            .sort()

        console.log(`Found ${files.length} migration files\n`)

        // Run each migration
        let completed = 0
        let skipped = 0

        for (const file of files) {
            try {
                console.log(`⏳ Running: ${file}`)
                const migrationPath = join(migrationsDir, file)
                const migration = await import(migrationPath)

                if (migration.up) {
                    await migration.up(db.getQueryInterface(), db.Sequelize)
                    console.log(`✅ Completed: ${file}\n`)
                    completed++
                } else {
                    console.log(`⚠️  Skipped: ${file} (no up function)\n`)
                    skipped++
                }
            } catch (error) {
                // Some migrations may fail if tables already exist
                if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                    console.log(`⏭️  Skipped: ${file} (already applied)\n`)
                    skipped++
                } else {
                    console.error(`❌ Failed: ${file}`)
                    console.error(`Error: ${error.message}\n`)
                    // Continue with next migration instead of stopping
                }
            }
        }

        console.log('\n=== Migration Summary ===')
        console.log(`✅ Completed: ${completed}`)
        console.log(`⏭️  Skipped: ${skipped}`)
        console.log(`📁 Total: ${files.length}`)
        console.log('\n🎉 Migration process finished!')

    } catch (error) {
        console.error('❌ Migration process failed:', error.message)
        if (error.stack) console.error(error.stack)
        process.exit(1)
    } finally {
        process.exit(0)
    }
}

runAllMigrations()

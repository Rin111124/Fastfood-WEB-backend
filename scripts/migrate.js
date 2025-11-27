import { Sequelize } from 'sequelize';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addNewsImageColumns() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/config/config.json'), 'utf8'));
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config[env];

    const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
      host: dbConfig.host,
      dialect: dbConfig.dialect
    });

    await sequelize.authenticate();
    console.log('Database connected successfully.');

    const queryInterface = sequelize.getQueryInterface();

    // Add image_data column if it doesn't exist
    try {
      await queryInterface.addColumn('news', 'image_data', {
        type: Sequelize.BLOB('long'),
        allowNull: true
      });
      console.log('Added image_data column');
    } catch (err) {
      if (err.message.includes('duplicate')) {
        console.log('image_data column already exists');
      } else {
        throw err;
      }
    }

    // Add image_mime column if it doesn't exist
    try {
      await queryInterface.addColumn('news', 'image_mime', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
      console.log('Added image_mime column');
    } catch (err) {
      if (err.message.includes('duplicate')) {
        console.log('image_mime column already exists');
      } else {
        throw err;
      }
    }

    await sequelize.close();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

addNewsImageColumns();
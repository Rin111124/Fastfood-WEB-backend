'use strict';

const SAMPLE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEA3kOuvQAAAABJRU5ErkJggg==';
const SAMPLE_IMAGE_MIME = 'image/png';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [categories] = await queryInterface.sequelize.query(
      'SELECT category_id, category_name FROM products_category;'
    );
    const resolveCategoryId = (name) =>
      categories.find((category) => category.category_name === name)?.category_id || null;

    const buildImage = () => Buffer.from(SAMPLE_IMAGE_BASE64, 'base64');

    await queryInterface.bulkInsert('products', [
      {
        name: 'Cheese Burger',
        description: 'Banh burger pho mai kinh dien',
        price: 55000,
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        is_active: 1,
        category_id: resolveCategoryId('Burgers'),
        created_at: now,
        updated_at: now
      },
      {
        name: 'Double Beef Burger',
        description: 'Burger bo hai lop dam da',
        price: 69000,
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        is_active: 1,
        category_id: resolveCategoryId('Burgers'),
        created_at: now,
        updated_at: now
      },
      {
        name: 'French Fries',
        description: 'Khoai tay chien vang gion',
        price: 25000,
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        is_active: 1,
        category_id: resolveCategoryId('Sides'),
        created_at: now,
        updated_at: now
      },
      {
        name: 'Classic Cola',
        description: 'Nuoc giai khat co gas',
        price: 15000,
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        is_active: 1,
        category_id: resolveCategoryId('Drinks'),
        created_at: now,
        updated_at: now
      },
      {
        name: 'Vanilla Ice Cream',
        description: 'Kem vani mat lanh',
        price: 20000,
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        is_active: 1,
        category_id: resolveCategoryId('Desserts'),
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('products', null, {});
  }
};

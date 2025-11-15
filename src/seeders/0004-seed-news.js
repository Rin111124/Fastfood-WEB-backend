'use strict';

const SAMPLE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAVUlEQVQ4jWNkIBIwEqmOYBx1CIjmJghT4/9wMDAw8B+RiYGB4T8mBhpGxCmoGSmkCxGNhAJsCMRqmB0gkFLxgUhgMZiMuAaRrUQw7gKFgFAD37Dwmngk3vAAAAAElFTkSuQmCC';
const SAMPLE_IMAGE_MIME = 'image/png';

module.exports = {
  async up(qi) {
    const now = new Date();
    const buildImage = () => Buffer.from(SAMPLE_IMAGE_BASE64, 'base64');

    await qi.bulkInsert('news', [
      {
        title: 'Grand opening spotlight',
        content: 'We have opened a new FatFood branch downtown with a 20% discount during the first week.',
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        image_url: null,
        created_at: now,
        updated_at: now
      },
      {
        title: 'Summer menu refresh',
        content: 'Try our iced beverages and light combo meals tailored for hot days.',
        image_data: buildImage(),
        image_mime: SAMPLE_IMAGE_MIME,
        image_url: null,
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(qi) {
    await qi.bulkDelete('news', null, {});
  }
};

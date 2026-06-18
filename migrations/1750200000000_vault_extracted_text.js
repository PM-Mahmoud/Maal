// Adds extracted_text to vault_files so uploaded documents can be read by Maal
// (Ask Maal context + figure extraction). Text-based formats only for now;
// OCR for scans/photos is a later pass.
module.exports = {
  name: 'vault_extracted_text',
  up: async (client) => {
    await client.query(`
      ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS extracted_text TEXT;
    `);
  },
};

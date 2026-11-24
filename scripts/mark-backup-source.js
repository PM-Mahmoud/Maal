const { safeError } = require('../lib/safe-log');
const db = require('../db/operational-resilience');

db.touchBackupSourceMarker().then((marker) => {
  console.log(`Backup source marker advanced to generation ${marker.generation}`);
  process.exit(0);
}).catch((error) => {
  console.error('Could not advance backup source marker:', safeError(error));
  process.exit(1);
});

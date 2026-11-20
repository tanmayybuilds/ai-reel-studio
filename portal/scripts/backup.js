// `npm run backup`: write a consistent copy of the database to data/backups/ right now.
import { backupDatabase } from '../src/maintenance.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
console.log(`Database backed up to ${backupDatabase(stamp)}`);

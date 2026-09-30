/** HTTP deployment entry point, using the same catalog and security as the CLI. */
import 'dotenv/config';
import './utils/stdout-guard.js';
import { main } from './server/index.js';
process.env.TRANSPORT_TYPE = process.env.TRANSPORT_TYPE || 'http';
main().catch(error => { console.error(error); process.exitCode = 1; });

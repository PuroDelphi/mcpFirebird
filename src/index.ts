/** Alternate executable entry point; intentionally identical to the CLI runtime. */
import 'dotenv/config';
import './utils/stdout-guard.js';
import { main } from './server/index.js';
main().catch(error => { console.error(error); process.exitCode = 1; });

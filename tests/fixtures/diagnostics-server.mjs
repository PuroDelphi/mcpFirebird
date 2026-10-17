import { installContractDriver } from './contract-driver.mjs';
installContractDriver({ plans: true });
const { main } = await import('../../dist/server/index.js');
await main();

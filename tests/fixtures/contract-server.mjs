import { installContractDriver } from './contract-driver.mjs';
installContractDriver();
const { main } = await import('../../dist/server/index.js');
await main();

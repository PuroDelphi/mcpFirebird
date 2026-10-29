import { installContractDriver } from './contract-driver.mjs';
import { DriverFactory } from '../../dist/db/driver-factory.js';

installContractDriver({ plans: true });
if (process.env.OUTPUT_ENCODING_DRIVER_FAILURE === 'true') {
    DriverFactory.getDriver = async () => ({
        attach: async () => { throw new Error('Connection refused: <b>tofu-poc</b>'); }
    });
}
const { main } = await import('../../dist/server/index.js');
await main();

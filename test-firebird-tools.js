// Test script for Firebird tools utilities
import { checkFirebirdTools, findFirebirdBinPath } from './dist/utils/firebird-tools.js';

async function main() {
    console.log('Checking for Firebird client tools...');
    const toolsCheck = await checkFirebirdTools();
    
    console.log(`Firebird tools installed: ${toolsCheck.installed}`);
    
    if (!toolsCheck.installed) {
        console.log(`Missing tools: ${toolsCheck.missingTools.join(', ')}`);
        console.log('Installation instructions:');
        console.log(toolsCheck.installInstructions);
    } else {
        console.log('All required Firebird tools are installed.');
    }
    
    console.log('\nSearching for Firebird bin directory...');
    const binPath = await findFirebirdBinPath();
    
    if (binPath) {
        console.log(`Found Firebird bin directory: ${binPath}`);
    } else {
        console.log('Firebird bin directory not found in common locations.');
    }
}

main().catch(console.error);

/**
 * Utility functions for checking and managing Firebird client tools
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('utils:firebird-tools');

/**
 * Interface for Firebird tools check result
 */
export interface FirebirdToolsCheckResult {
    installed: boolean;
    missingTools: string[];
    installInstructions: string;
}

/**
 * Check if a command exists in the system path
 * @param command - Command to check
 * @returns True if command exists, false otherwise
 */
export const commandExists = async (command: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows ? 'where' : 'which';
        const args = isWindows ? [command] : [command];

        const proc = spawn(cmd, args);

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', () => {
            resolve(false);
        });
    });
};

/**
 * Check if Firebird client tools are installed
 * @returns Object with installation status and instructions
 */
export const checkFirebirdTools = async (): Promise<FirebirdToolsCheckResult> => {
    const requiredTools = ['gbak', 'gfix', 'isql'];
    const missingTools: string[] = [];

    for (const tool of requiredTools) {
        if (!(await commandExists(tool))) {
            missingTools.push(tool);
        }
    }

    const installed = missingTools.length === 0;

    let installInstructions = '';
    if (!installed) {
        installInstructions = getInstallInstructions(missingTools);
    }

    return {
        installed,
        missingTools,
        installInstructions
    };
};

/**
 * Get installation instructions for Firebird client tools
 * @param missingTools - List of missing tools
 * @returns Installation instructions
 */
const getInstallInstructions = (missingTools: string[]): string => {
    const platform = process.platform;

    if (platform === 'win32') {
        return `
Missing Firebird client tools: ${missingTools.join(', ')}

To install Firebird client tools on Windows:
1. Download Firebird from https://firebirdsql.org/en/downloads/
2. Run the installer and select "Client components" during installation
3. Add the Firebird bin directory to your PATH environment variable
   (typically C:\\Program Files\\Firebird\\Firebird_X_X\\bin)
4. Restart your terminal or application
`;
    } else if (platform === 'darwin') {
        return `
Missing Firebird client tools: ${missingTools.join(', ')}

To install Firebird client tools on macOS:
1. Using Homebrew: brew install firebird
2. Or download from https://firebirdsql.org/en/downloads/
3. Make sure the Firebird bin directory is in your PATH
4. Restart your terminal or application
`;
    } else {
        // Linux and others
        return `
Missing Firebird client tools: ${missingTools.join(', ')}

To install Firebird client tools on Linux:
- Debian/Ubuntu: sudo apt-get install firebird3.0-utils
- Fedora/RHEL: sudo dnf install firebird-utils
- Alpine Linux: Not supported for backup/restore operations. Use Debian/Ubuntu instead.

After installation, restart your terminal or application
`;
    }
};

/**
 * Find Firebird client tools in common installation directories
 * @returns Path to Firebird bin directory or null if not found
 */
export const findFirebirdBinPath = async (): Promise<string | null> => {
    const isWindows = process.platform === 'win32';

    const commonPaths = isWindows ? [
        'C:\\Program Files\\Firebird\\Firebird_5_0\\bin',
        'C:\\Program Files\\Firebird\\Firebird_4_0\\bin',
        'C:\\Program Files\\Firebird\\Firebird_3_0\\bin',
        'C:\\Program Files\\Firebird\\Firebird_2_5\\bin',
        'C:\\Program Files (x86)\\Firebird\\Firebird_5_0\\bin',
        'C:\\Program Files (x86)\\Firebird\\Firebird_4_0\\bin',
        'C:\\Program Files (x86)\\Firebird\\Firebird_3_0\\bin',
        'C:\\Program Files (x86)\\Firebird\\Firebird_2_5\\bin'
    ] : [
        '/usr/local/firebird/bin',
        '/opt/firebird/bin',
        '/usr/bin',
        '/usr/local/bin'
    ];

    for (const path of commonPaths) {
        const toolPath = join(path, isWindows ? 'gbak.exe' : 'gbak');
        if (existsSync(toolPath)) {
            return path;
        }
    }

    return null;
};

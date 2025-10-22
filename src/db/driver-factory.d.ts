/**
 * Type declarations for optional node-firebird-driver-native module
 * This allows TypeScript to compile without the module being installed
 */

declare module 'node-firebird-driver-native' {
    export function createNativeClient(libraryPath: string): any;
    export function getDefaultLibraryFilename(): string;
}


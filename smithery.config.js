/**
 * Smithery Build Configuration
 * 
 * This file customizes the esbuild process used by Smithery CLI
 * to build the TypeScript MCP server.
 * 
 * Documentation: https://smithery.ai/docs/build/getting-started
 */

export default {
  esbuild: {
    // Mark packages that should not be bundled
    // These will be loaded from node_modules at runtime
    external: [
      // Native modules that can't be bundled
      'node-firebird',
      'node-firebird-driver-native',
      
      // Large dependencies that are better loaded externally
      '@modelcontextprotocol/sdk',
      
      // Packages with native dependencies
      'winston'
    ],
    
    // Enable minification for smaller bundle size
    minify: true,
    
    // Target Node.js 18+ (Smithery requirement)
    target: 'node18',
    
    // Keep names for better debugging
    keepNames: true,
    
    // Source maps for debugging
    sourcemap: true,
    
    // Platform
    platform: 'node',
    
    // Format
    format: 'esm'
  }
};


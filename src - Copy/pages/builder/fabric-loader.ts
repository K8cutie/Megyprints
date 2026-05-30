/**
 * Fabric.js loader — uses the globally-loaded Fabric from the script tag.
 * 
 * Fabric 5.x is loaded via <script src="/fabric.min.js"> in index.html
 * which sets window.fabric. This avoids all Vite/Rollup bundling issues
 * with CommonJS modules in production.
 */

const fabric = (typeof window !== 'undefined' && (window as any).fabric)
  ? (window as any).fabric
  : null;

export default fabric as typeof import('fabric');

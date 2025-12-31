/**
 * Signing module exports
 */

export type { SigningProvider, SignedMessage } from './types';

export { verifySignedMessage, createSignedMessage } from './types';

// WASM implementation (for desktop/web)
export { WasmSigningProvider } from './wasm-provider';

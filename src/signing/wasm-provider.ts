/**
 * WASM SigningProvider implementation
 *
 * Wraps the channel-wasm WASM module to implement the SigningProvider interface.
 * Used by desktop/web applications.
 */

import type { SigningProvider } from './types';
import type { ChannelWasmModule } from '../crypto/wasm-provider';

/**
 * Parse WASM verification result
 * Returns true for "true"/"valid", false for "false"/"invalid"
 */
function parseVerifyResult(result: string): boolean {
  const normalized = result.toLowerCase().trim();
  if (normalized === 'true' || normalized === 'valid') {
    return true;
  }
  if (normalized === 'false' || normalized === 'invalid') {
    return false;
  }
  // Check for error patterns
  if (
    result.startsWith('invalid') ||
    result.startsWith('error') ||
    result.includes('failed') ||
    result.includes('Error')
  ) {
    throw new Error(result);
  }
  // Try to parse as JSON boolean
  try {
    return JSON.parse(result) as boolean;
  } catch {
    throw new Error(`Unexpected verification result: ${result}`);
  }
}

/**
 * WasmSigningProvider - Implements SigningProvider using channel-wasm
 */
export class WasmSigningProvider implements SigningProvider {
  private wasm: ChannelWasmModule;

  constructor(wasmModule: ChannelWasmModule) {
    this.wasm = wasmModule;
  }

  async signEd448(privateKey: string, message: string): Promise<string> {
    const result = this.wasm.js_sign_ed448(privateKey, message);

    // Check for error patterns
    if (
      result.startsWith('invalid') ||
      result.startsWith('error') ||
      result.includes('failed') ||
      result.includes('Error')
    ) {
      throw new Error(result);
    }

    // Remove quotes if present (WASM returns quoted string)
    if (result.startsWith('"') && result.endsWith('"')) {
      return result.slice(1, -1);
    }

    return result;
  }

  async verifyEd448(publicKey: string, message: string, signature: string): Promise<boolean> {
    const result = this.wasm.js_verify_ed448(publicKey, message, signature);
    return parseVerifyResult(result);
  }
}

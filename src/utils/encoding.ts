/**
 * Encoding utilities for hex and base64 conversions
 *
 * These are platform-agnostic utilities for converting between
 * byte arrays and string representations.
 */

/**
 * Convert a hex string to a byte array
 * @param hex - Hexadecimal string (with or without 0x prefix)
 * @returns Array of bytes
 */
export function hexToBytes(hex: string): number[] {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

/**
 * Convert a byte array to a hex string
 * @param bytes - Array of bytes (number[] or Uint8Array)
 * @returns Hexadecimal string (lowercase, no prefix)
 */
export function bytesToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a base64 string to a Uint8Array
 * @param base64 - Base64-encoded string
 * @returns Uint8Array of bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
  // Handle both browser and Node.js environments
  if (typeof atob === 'function') {
    // Browser environment
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } else {
    // Node.js environment
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

/**
 * Convert a byte array to a base64 string
 * @param bytes - Array of bytes (number[] or Uint8Array)
 * @returns Base64-encoded string
 */
export function bytesToBase64(bytes: number[] | Uint8Array): string {
  // Handle both browser and Node.js environments
  if (typeof btoa === 'function') {
    // Browser environment
    const binaryString = Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join('');
    return btoa(binaryString);
  } else {
    // Node.js environment
    return Buffer.from(bytes).toString('base64');
  }
}

/**
 * Convert a UTF-8 string to a byte array
 * @param str - UTF-8 string
 * @returns Array of bytes
 */
export function stringToBytes(str: string): number[] {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(str));
}

/**
 * Convert a byte array to a UTF-8 string
 * @param bytes - Array of bytes (number[] or Uint8Array)
 * @returns UTF-8 string
 */
export function bytesToString(bytes: number[] | Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(bytes));
}

/**
 * Convert a number to an 8-byte big-endian array (int64)
 * Used for timestamp serialization in signatures
 *
 * @param num - The number to convert (must be within safe integer range)
 * @returns 8-byte Uint8Array in big-endian format
 */
export function int64ToBytes(num: number): Uint8Array {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigInt64(0, BigInt(num), false);
  return arr;
}

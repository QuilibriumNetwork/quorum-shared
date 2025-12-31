/**
 * Signing types and SigningProvider interface
 *
 * Platform-agnostic message signing and verification.
 * Uses Ed448 for all signing operations.
 */

/**
 * SigningProvider - Platform-agnostic interface for cryptographic signing
 *
 * Implementations:
 * - WASM (desktop/web): Uses channel-wasm js_sign_ed448/js_verify_ed448
 * - Native (iOS/Android): Uses uniffi-generated bindings
 */
export interface SigningProvider {
  /**
   * Sign a message using Ed448
   * @param privateKey Base64-encoded Ed448 private key (56 bytes)
   * @param message Base64-encoded message to sign
   * @returns Base64-encoded signature (114 bytes)
   */
  signEd448(privateKey: string, message: string): Promise<string>;

  /**
   * Verify an Ed448 signature
   * @param publicKey Base64-encoded Ed448 public key (57 bytes)
   * @param message Base64-encoded original message
   * @param signature Base64-encoded signature to verify
   * @returns true if signature is valid, false otherwise
   */
  verifyEd448(publicKey: string, message: string, signature: string): Promise<boolean>;
}

/**
 * Signed message structure
 */
export interface SignedMessage {
  /** The message content (may be encrypted) */
  content: string;
  /** Base64-encoded Ed448 signature */
  signature: string;
  /** Base64-encoded Ed448 public key of signer */
  publicKey: string;
  /** Timestamp when signed */
  timestamp: number;
}

/**
 * Verify a signed message structure
 */
export async function verifySignedMessage(
  provider: SigningProvider,
  message: SignedMessage
): Promise<boolean> {
  // Reconstruct the signed payload (content + timestamp)
  const payload = `${message.content}:${message.timestamp}`;
  const payloadBase64 = btoa(payload);

  return provider.verifyEd448(message.publicKey, payloadBase64, message.signature);
}

/**
 * Create a signed message
 */
export async function createSignedMessage(
  provider: SigningProvider,
  privateKey: string,
  publicKey: string,
  content: string
): Promise<SignedMessage> {
  const timestamp = Date.now();
  const payload = `${content}:${timestamp}`;
  const payloadBase64 = btoa(payload);

  const signature = await provider.signEd448(privateKey, payloadBase64);

  return {
    content,
    signature,
    publicKey,
    timestamp,
  };
}

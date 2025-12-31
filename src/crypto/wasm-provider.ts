/**
 * WASM CryptoProvider implementation
 *
 * Wraps the channel-wasm WASM module to implement the CryptoProvider interface.
 * Used by desktop/web applications.
 *
 * Note: This file imports from the WASM module dynamically to avoid bundling
 * issues in environments that don't support WASM.
 */

import type {
  CryptoProvider,
  Ed448Keypair,
  X448Keypair,
  SenderX3DHParams,
  ReceiverX3DHParams,
  NewDoubleRatchetParams,
  DoubleRatchetStateAndMessage,
  DoubleRatchetStateAndEnvelope,
  NewTripleRatchetParams,
  TripleRatchetStateAndMetadata,
  TripleRatchetStateAndMessage,
  TripleRatchetStateAndEnvelope,
  InboxMessageEncryptRequest,
  InboxMessageDecryptRequest,
} from './types';

/**
 * Interface for the WASM module functions
 * This matches the exports from channel-wasm
 */
export interface ChannelWasmModule {
  js_generate_x448(): string;
  js_generate_ed448(): string;
  js_get_pubkey_x448(key: string): string;
  js_get_pubkey_ed448(key: string): string;
  js_sign_ed448(key: string, message: string): string;
  js_verify_ed448(publicKey: string, message: string, signature: string): string;
  js_sender_x3dh(input: string): string;
  js_receiver_x3dh(input: string): string;
  js_new_double_ratchet(params: string): string;
  js_double_ratchet_encrypt(params: string): string;
  js_double_ratchet_decrypt(params: string): string;
  js_new_triple_ratchet(params: string): string;
  js_triple_ratchet_init_round_1(params: string): string;
  js_triple_ratchet_init_round_2(params: string): string;
  js_triple_ratchet_init_round_3(params: string): string;
  js_triple_ratchet_init_round_4(params: string): string;
  js_triple_ratchet_encrypt(params: string): string;
  js_triple_ratchet_decrypt(params: string): string;
  js_triple_ratchet_resize(params: string): string;
  js_encrypt_inbox_message(input: string): string;
  js_decrypt_inbox_message(input: string): string;
}

/**
 * Parse WASM result and check for errors
 * WASM functions return error strings on failure
 */
function parseWasmResult<T>(result: string): T {
  // Check for common error patterns
  if (
    result.startsWith('invalid') ||
    result.startsWith('error') ||
    result.includes('failed') ||
    result.includes('Error')
  ) {
    throw new Error(result);
  }

  try {
    return JSON.parse(result) as T;
  } catch {
    // If it's not JSON, it might be a quoted string or error
    if (result.startsWith('"') && result.endsWith('"')) {
      // Remove quotes from string results
      return result.slice(1, -1) as unknown as T;
    }
    throw new Error(`Failed to parse WASM result: ${result}`);
  }
}

/**
 * WasmCryptoProvider - Implements CryptoProvider using channel-wasm
 */
export class WasmCryptoProvider implements CryptoProvider {
  private wasm: ChannelWasmModule;

  constructor(wasmModule: ChannelWasmModule) {
    this.wasm = wasmModule;
  }

  // ============ Key Generation ============

  async generateX448(): Promise<X448Keypair> {
    const result = this.wasm.js_generate_x448();
    const keypair = parseWasmResult<{ public_key: number[]; private_key: number[] }>(result);
    return {
      type: 'x448',
      public_key: keypair.public_key,
      private_key: keypair.private_key,
    };
  }

  async generateEd448(): Promise<Ed448Keypair> {
    const result = this.wasm.js_generate_ed448();
    const keypair = parseWasmResult<{ public_key: number[]; private_key: number[] }>(result);
    return {
      type: 'ed448',
      public_key: keypair.public_key,
      private_key: keypair.private_key,
    };
  }

  async getPublicKeyX448(privateKey: string): Promise<string> {
    const result = this.wasm.js_get_pubkey_x448(privateKey);
    return parseWasmResult<string>(result);
  }

  async getPublicKeyEd448(privateKey: string): Promise<string> {
    const result = this.wasm.js_get_pubkey_ed448(privateKey);
    return parseWasmResult<string>(result);
  }

  // ============ X3DH Key Agreement ============

  async senderX3DH(params: SenderX3DHParams): Promise<string> {
    const input = JSON.stringify({
      sending_identity_private_key: params.sending_identity_private_key,
      sending_ephemeral_private_key: params.sending_ephemeral_private_key,
      receiving_identity_key: params.receiving_identity_key,
      receiving_signed_pre_key: params.receiving_signed_pre_key,
      session_key_length: params.session_key_length,
    });
    const result = this.wasm.js_sender_x3dh(input);
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  async receiverX3DH(params: ReceiverX3DHParams): Promise<string> {
    const input = JSON.stringify({
      sending_identity_private_key: params.sending_identity_private_key,
      sending_signed_private_key: params.sending_signed_private_key,
      receiving_identity_key: params.receiving_identity_key,
      receiving_ephemeral_key: params.receiving_ephemeral_key,
      session_key_length: params.session_key_length,
    });
    const result = this.wasm.js_receiver_x3dh(input);
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  // ============ Double Ratchet ============

  async newDoubleRatchet(params: NewDoubleRatchetParams): Promise<string> {
    const input = JSON.stringify({
      session_key: params.session_key,
      sending_header_key: params.sending_header_key,
      next_receiving_header_key: params.next_receiving_header_key,
      is_sender: params.is_sender,
      sending_ephemeral_private_key: params.sending_ephemeral_private_key,
      receiving_ephemeral_key: params.receiving_ephemeral_key,
    });
    const result = this.wasm.js_new_double_ratchet(input);
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  async doubleRatchetEncrypt(
    stateAndMessage: DoubleRatchetStateAndMessage
  ): Promise<DoubleRatchetStateAndEnvelope> {
    const input = JSON.stringify({
      ratchet_state: stateAndMessage.ratchet_state,
      message: stateAndMessage.message,
    });
    const result = this.wasm.js_double_ratchet_encrypt(input);
    return parseWasmResult<DoubleRatchetStateAndEnvelope>(result);
  }

  async doubleRatchetDecrypt(
    stateAndEnvelope: DoubleRatchetStateAndEnvelope
  ): Promise<DoubleRatchetStateAndMessage> {
    const input = JSON.stringify({
      ratchet_state: stateAndEnvelope.ratchet_state,
      envelope: stateAndEnvelope.envelope,
    });
    const result = this.wasm.js_double_ratchet_decrypt(input);
    return parseWasmResult<DoubleRatchetStateAndMessage>(result);
  }

  // ============ Triple Ratchet ============

  async newTripleRatchet(params: NewTripleRatchetParams): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify({
      peers: params.peers,
      peer_key: params.peer_key,
      identity_key: params.identity_key,
      signed_pre_key: params.signed_pre_key,
      threshold: params.threshold,
      async_dkg_ratchet: params.async_dkg_ratchet,
    });
    const result = this.wasm.js_new_triple_ratchet(input);
    return parseWasmResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound1(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = this.wasm.js_triple_ratchet_init_round_1(input);
    return parseWasmResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound2(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = this.wasm.js_triple_ratchet_init_round_2(input);
    return parseWasmResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound3(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = this.wasm.js_triple_ratchet_init_round_3(input);
    return parseWasmResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound4(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = this.wasm.js_triple_ratchet_init_round_4(input);
    return parseWasmResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetEncrypt(
    stateAndMessage: TripleRatchetStateAndMessage
  ): Promise<TripleRatchetStateAndEnvelope> {
    const input = JSON.stringify({
      ratchet_state: stateAndMessage.ratchet_state,
      message: stateAndMessage.message,
    });
    const result = this.wasm.js_triple_ratchet_encrypt(input);
    return parseWasmResult<TripleRatchetStateAndEnvelope>(result);
  }

  async tripleRatchetDecrypt(
    stateAndEnvelope: TripleRatchetStateAndEnvelope
  ): Promise<TripleRatchetStateAndMessage> {
    const input = JSON.stringify({
      ratchet_state: stateAndEnvelope.ratchet_state,
      envelope: stateAndEnvelope.envelope,
    });
    const result = this.wasm.js_triple_ratchet_decrypt(input);
    return parseWasmResult<TripleRatchetStateAndMessage>(result);
  }

  async tripleRatchetResize(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = this.wasm.js_triple_ratchet_resize(input);
    return parseWasmResult<TripleRatchetStateAndMetadata>(result);
  }

  // ============ Inbox Message Encryption ============

  async encryptInboxMessage(request: InboxMessageEncryptRequest): Promise<string> {
    const input = JSON.stringify({
      inbox_public_key: request.inbox_public_key,
      ephemeral_private_key: request.ephemeral_private_key,
      plaintext: request.plaintext,
    });
    const result = this.wasm.js_encrypt_inbox_message(input);
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  async decryptInboxMessage(request: InboxMessageDecryptRequest): Promise<number[]> {
    const input = JSON.stringify({
      inbox_private_key: request.inbox_private_key,
      ephemeral_public_key: request.ephemeral_public_key,
      ciphertext: request.ciphertext,
    });
    const result = this.wasm.js_decrypt_inbox_message(input);
    return parseWasmResult<number[]>(result);
  }
}

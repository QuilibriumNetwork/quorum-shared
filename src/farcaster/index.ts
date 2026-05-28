/**
 * Farcaster integration: hypersnap (haatz.quilibrium.com) preferred, with
 * legacy farcaster.xyz / client.warpcast.com as automatic fallback.
 *
 * Read hooks return a NormalizedCast / NormalizedUser shape independent
 * of which source served the data. Write hooks branch on whether the
 * user has opted into a Hypersnap signer.
 */

export * from './types';
export * from './hypersnapClient';
export * from './legacyClient';
export * from './normalize';
export * from './messageBuilder';
// Selective re-exports avoid clashing with utils/encoding's hexToBytes/bytesToHex.
export {
  KEY_DOMAIN_NAME,
  KEY_DOMAIN_VERSION,
  SIGNED_KEY_REQUEST_CHAIN_ID,
  signedKeyRequestDigest,
  keyAddDigest,
  keyRemoveDigest,
  signEip712Digest,
  addressFromCustodyPrivateKey,
  abiEncodeSignedKeyRequestMetadata,
  buildSignedKeyRequestMetadata,
} from './signedKeyRequest';
export * from './signerStore';
export * from './signerLifecycle';
export * from './hooks';

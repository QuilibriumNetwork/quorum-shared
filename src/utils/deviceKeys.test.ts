import { describe, it, expect } from 'vitest';
import {
  ANNOUNCE_KEYS_DOMAIN,
  REVOKE_DEVICE_DOMAIN,
  DEVICE_KEY_STATEMENT_MAX_SKEW_MS,
  buildDeviceKeyStatementBytes,
  isDeviceKeyStatementType,
  verifyDeviceKeyStatement,
  type AnnounceKeysStatement,
  type RevokeDeviceStatement,
} from './deviceKeys';
import { deriveInboxAddress, resolveVerifiedSender } from './messageAuth';
import { bytesToBase64, hexToBytes, stringToBytes } from './encoding';
import type { SpaceMember, SpaceMemberDevice } from '../types';

// Arbitrary but valid hex keys (content irrelevant — only their hashes matter).
const USER_PUB = '11'.repeat(57);
const DEVICE_KEY_PUB = '22'.repeat(57);
const JOIN_KEY_PUB = '33'.repeat(57);
const USER_ADDRESS = deriveInboxAddress(USER_PUB);
const SPACE_ID = 'space-1';
const DEVICE_INBOX = 'device-dm-inbox-addr';
const SIG = 'ab'.repeat(114);
const NOW = 1_000_000;

// Stub SigningProvider: records calls, returns a preset result. The real Ed448
// lives in each app; shared's job is the surrounding logic + byte construction.
const makeProvider = (result: boolean) => {
  const calls: { publicKey: string; message: string; signature: string }[] = [];
  return {
    calls,
    verifyEd448: async (publicKey: string, message: string, signature: string) => {
      calls.push({ publicKey, message, signature });
      return result;
    },
  };
};

const announce = (
  overrides: Partial<AnnounceKeysStatement> = {}
): AnnounceKeysStatement => ({
  type: 'announce-keys',
  userAddress: USER_ADDRESS,
  userPublicKey: USER_PUB,
  spaceId: SPACE_ID,
  deviceInboxAddress: DEVICE_INBOX,
  spaceKeyPublicKey: DEVICE_KEY_PUB,
  timestamp: NOW,
  signature: SIG,
  ...overrides,
});

const revoke = (
  overrides: Partial<RevokeDeviceStatement> = {}
): RevokeDeviceStatement => ({
  type: 'revoke-device',
  userAddress: USER_ADDRESS,
  userPublicKey: USER_PUB,
  spaceId: SPACE_ID,
  deviceInboxAddress: DEVICE_INBOX,
  timestamp: NOW,
  signature: SIG,
  ...overrides,
});

describe('deviceKeys - statement bytes (cross-platform golden format)', () => {
  it('announce-keys serializes to a fixed, newline-delimited, domain-prefixed string', () => {
    const bytes = buildDeviceKeyStatementBytes({
      type: 'announce-keys',
      userAddress: 'U',
      userPublicKey: 'PK',
      spaceId: 'S',
      deviceInboxAddress: 'D',
      spaceKeyPublicKey: 'K',
      timestamp: 1000,
      signature: 'SIG',
    });
    // GOLDEN: desktop and mobile must produce EXACTLY this or signatures split.
    expect(bytes).toBe(`${ANNOUNCE_KEYS_DOMAIN}\nU\nS\nD\nK\n1000`);
  });

  it('revoke-device serializes to its own domain-prefixed golden string', () => {
    const bytes = buildDeviceKeyStatementBytes({
      type: 'revoke-device',
      userAddress: 'U',
      userPublicKey: 'PK',
      spaceId: 'S',
      deviceInboxAddress: 'D',
      timestamp: 2000,
      signature: 'SIG',
    });
    expect(bytes).toBe(`${REVOKE_DEVICE_DOMAIN}\nU\nS\nD\n2000`);
  });

  it('announce and revoke never collide even with identical field values', () => {
    const common = {
      userAddress: 'U',
      userPublicKey: 'PK',
      spaceId: 'S',
      deviceInboxAddress: 'D',
      timestamp: 1,
      signature: 'x',
    };
    const a = buildDeviceKeyStatementBytes({
      ...common,
      type: 'announce-keys',
      spaceKeyPublicKey: '',
    });
    const r = buildDeviceKeyStatementBytes({ ...common, type: 'revoke-device' });
    expect(a).not.toBe(r);
  });

  it('isDeviceKeyStatementType guards the two known types', () => {
    expect(isDeviceKeyStatementType('announce-keys')).toBe(true);
    expect(isDeviceKeyStatementType('revoke-device')).toBe(true);
    expect(isDeviceKeyStatementType('update-profile')).toBe(false);
  });
});

describe('deviceKeys - verifyDeviceKeyStatement', () => {
  it('admits a well-formed, correctly-signed announce-keys statement', async () => {
    const provider = makeProvider(true);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      announce(),
      undefined,
      NOW
    );
    expect(verdict.action).toBe('admit');
    if (verdict.action !== 'admit') return;
    expect(verdict.device).toEqual<SpaceMemberDevice>({
      spaceId: SPACE_ID,
      userAddress: USER_ADDRESS,
      deviceInboxAddress: DEVICE_INBOX,
      inboxAddress: deriveInboxAddress(DEVICE_KEY_PUB),
      spaceKeyPublicKey: DEVICE_KEY_PUB,
      timestamp: NOW,
      revoked: false,
    });
  });

  it('verifies Ed448 over EXACTLY the canonical statement bytes and the master key', async () => {
    const provider = makeProvider(true);
    const stmt = announce();
    await verifyDeviceKeyStatement(provider, stmt, undefined, NOW);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].message).toBe(
      bytesToBase64(stringToBytes(buildDeviceKeyStatementBytes(stmt)))
    );
    expect(provider.calls[0].publicKey).toBe(bytesToBase64(hexToBytes(USER_PUB)));
    expect(provider.calls[0].signature).toBe(bytesToBase64(hexToBytes(SIG)));
  });

  it('produces a revoke verdict for a valid revoke-device statement', async () => {
    const provider = makeProvider(true);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      revoke(),
      undefined,
      NOW
    );
    expect(verdict).toEqual({
      action: 'revoke',
      spaceId: SPACE_ID,
      userAddress: USER_ADDRESS,
      deviceInboxAddress: DEVICE_INBOX,
      timestamp: NOW,
    });
  });

  it('rejects a forged statement (signature invalid) fail-closed', async () => {
    const provider = makeProvider(false);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      announce(),
      undefined,
      NOW
    );
    expect(verdict).toEqual({ action: 'reject', reason: 'bad-signature' });
  });

  it('rejects when userPublicKey does not hash to userAddress (identity spoof)', async () => {
    const provider = makeProvider(true);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      announce({ userAddress: 'not-the-hash-of-userpub' }),
      undefined,
      NOW
    );
    expect(verdict).toEqual({ action: 'reject', reason: 'identity-mismatch' });
    // Cheap identity check must run BEFORE the Ed448 verify.
    expect(provider.calls).toHaveLength(0);
  });

  it('rejects a future-dated statement beyond the skew window', async () => {
    const provider = makeProvider(true);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      announce({ timestamp: NOW + DEVICE_KEY_STATEMENT_MAX_SKEW_MS + 1 }),
      undefined,
      NOW
    );
    expect(verdict).toEqual({ action: 'reject', reason: 'future-timestamp' });
    expect(provider.calls).toHaveLength(0);
  });

  it('accepts a statement inside the skew window', async () => {
    const provider = makeProvider(true);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      announce({ timestamp: NOW + DEVICE_KEY_STATEMENT_MAX_SKEW_MS }),
      undefined,
      NOW
    );
    expect(verdict.action).toBe('admit');
  });

  it('rejects a stale statement (LWW: not strictly newer than stored)', async () => {
    const provider = makeProvider(true);
    const older = await verifyDeviceKeyStatement(
      provider,
      announce({ timestamp: NOW }),
      { timestamp: NOW, revoked: false },
      NOW
    );
    expect(older).toEqual({ action: 'reject', reason: 'stale' });
    const equal = await verifyDeviceKeyStatement(
      provider,
      announce({ timestamp: NOW - 1 }),
      { timestamp: NOW, revoked: false },
      NOW
    );
    expect(equal).toEqual({ action: 'reject', reason: 'stale' });
    expect(provider.calls).toHaveLength(0);
  });

  it('lets a strictly-newer revoke supersede an existing admission', async () => {
    const provider = makeProvider(true);
    const verdict = await verifyDeviceKeyStatement(
      provider,
      revoke({ timestamp: NOW + 1 }),
      { timestamp: NOW, revoked: false },
      NOW + 100
    );
    expect(verdict.action).toBe('revoke');
  });

  it('rejects malformed statements (missing field / unknown type)', async () => {
    const provider = makeProvider(true);
    expect(
      await verifyDeviceKeyStatement(
        provider,
        announce({ spaceKeyPublicKey: '' }),
        undefined,
        NOW
      )
    ).toEqual({ action: 'reject', reason: 'malformed' });
    expect(
      await verifyDeviceKeyStatement(
        provider,
        { type: 'bogus' } as unknown as AnnounceKeysStatement,
        undefined,
        NOW
      )
    ).toEqual({ action: 'reject', reason: 'malformed' });
    expect(provider.calls).toHaveLength(0);
  });
});

describe('resolveVerifiedSender - per-device key path (additive)', () => {
  const ALICE = 'addr-alice';
  const member: SpaceMember = {
    address: ALICE,
    user_address: ALICE,
    inbox_address: deriveInboxAddress(JOIN_KEY_PUB),
  } as SpaceMember;
  const deviceKey: SpaceMemberDevice = {
    spaceId: SPACE_ID,
    userAddress: ALICE,
    deviceInboxAddress: DEVICE_INBOX,
    inboxAddress: deriveInboxAddress(DEVICE_KEY_PUB),
    spaceKeyPublicKey: DEVICE_KEY_PUB,
    timestamp: NOW,
    revoked: false,
  };

  it('resolves a message signed by the join key via path 1 (unchanged)', () => {
    expect(resolveVerifiedSender(JOIN_KEY_PUB, [member])).toBe(ALICE);
  });

  it('resolves a second-device key to its owner via path 2', () => {
    expect(resolveVerifiedSender(DEVICE_KEY_PUB, [member], [deviceKey])).toBe(
      ALICE
    );
  });

  it('is backward compatible: without deviceKeys, a second-device key is unresolved', () => {
    expect(resolveVerifiedSender(DEVICE_KEY_PUB, [member])).toBeNull();
  });

  it('returns null for a revoked device key (fail closed)', () => {
    expect(
      resolveVerifiedSender(DEVICE_KEY_PUB, [member], [
        { ...deviceKey, revoked: true },
      ])
    ).toBeNull();
  });

  it('returns null when the admission has no surviving member row', () => {
    expect(resolveVerifiedSender(DEVICE_KEY_PUB, [], [deviceKey])).toBeNull();
  });

  it('returns null when the owning member is kicked', () => {
    expect(
      resolveVerifiedSender(DEVICE_KEY_PUB, [{ ...member, isKicked: true }], [
        deviceKey,
      ])
    ).toBeNull();
  });
});

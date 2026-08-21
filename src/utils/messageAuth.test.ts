import { describe, it, expect } from 'vitest';
import { sha256 as mfSha256 } from 'multiformats/hashes/sha2';
import { base58btc } from 'multiformats/bases/base58';
import {
  authorizeControlMessage,
  authorizeThreadAction,
  buildMessageFingerprint,
  computeMessageIdHex,
  deriveInboxAddress,
  isControlMessageType,
  requiresVerifiedSignature,
  resolveVerifiedSender,
  shouldSignEdit,
  shouldSignOutbound,
  verifyAndResolveSender,
  type VerifiableSpaceMessage,
  type VerifiedSender,
} from './messageAuth';
import type { SigningProvider } from '../signing';
import type {
  EditMessage,
  Message,
  MuteMessage,
  PinMessage,
  PostMessage,
  RemoveMessage,
  Role,
  Space,
  SpaceMember,
} from '../types';

const ALICE = 'addr-alice';
const BOB = 'addr-bob';
const MALLORY = 'addr-mallory';
const SPACE_ID = 'space-1';
const CHANNEL_ID = 'channel-1';

const role = (members: string[], permissions: Role['permissions']): Role => ({
  roleId: 'r1',
  displayName: 'Mod',
  roleTag: 'mod',
  color: 'rgb(0,0,0)',
  members,
  permissions,
  isPublic: true,
});

const spaceWith = (roles: Role[], isRepudiable = false): Space =>
  ({ roles, isRepudiable } as unknown as Space);

const message = (senderId: string, signed = true): Message =>
  ({
    spaceId: SPACE_ID,
    channelId: CHANNEL_ID,
    messageId: 'msg-1',
    content: { type: 'post', senderId, text: 'hi' } as PostMessage,
    ...(signed ? { publicKey: 'aa', signature: 'bb' } : {}),
  } as unknown as Message);

const asVerified = (addr: string) => addr as VerifiedSender;

const removeMsg = (senderId: string): RemoveMessage => ({
  senderId,
  type: 'remove-message',
  removeMessageId: 'msg-1',
});

const editMsg = (senderId: string): EditMessage => ({
  senderId,
  type: 'edit-message',
  originalMessageId: 'msg-1',
  editedText: 'edited',
  editedAt: 123,
  editNonce: 'n1',
});

describe('buildMessageFingerprint', () => {
  it('keeps the legacy format for posts (no scope binding)', () => {
    const content: PostMessage = { type: 'post', senderId: ALICE, text: 'hello' };
    expect(
      buildMessageFingerprint({
        nonce: 'n',
        content,
        senderId: ALICE,
        spaceId: SPACE_ID,
        channelId: CHANNEL_ID,
      })
    ).toBe('n' + 'post' + ALICE + 'hello');
  });

  it('uses the real content type for control messages (not "post")', () => {
    const fp = buildMessageFingerprint({
      nonce: 'n',
      content: removeMsg(ALICE),
      senderId: ALICE,
      spaceId: SPACE_ID,
      channelId: CHANNEL_ID,
    });
    expect(fp).toContain('remove-message');
    expect(fp.startsWith('n' + 'remove-message')).toBe(true);
  });

  it('binds spaceId/channelId for control types only', () => {
    const control = buildMessageFingerprint({
      nonce: 'n',
      content: removeMsg(ALICE),
      senderId: ALICE,
      spaceId: SPACE_ID,
      channelId: CHANNEL_ID,
    });
    expect(control).toBe(
      'n' + 'remove-message' + ALICE + SPACE_ID + CHANNEL_ID + 'remove-message' + 'msg-1'
    );

    const post = buildMessageFingerprint({
      nonce: 'n',
      content: { type: 'post', senderId: ALICE, text: 'x' } as PostMessage,
      senderId: ALICE,
      spaceId: SPACE_ID,
      channelId: CHANNEL_ID,
    });
    expect(post).not.toContain(SPACE_ID);
  });

  it('treats string content as a post', () => {
    expect(
      buildMessageFingerprint({
        nonce: 'n',
        content: 'raw text',
        senderId: ALICE,
        spaceId: SPACE_ID,
        channelId: CHANNEL_ID,
      })
    ).toBe('n' + 'post' + ALICE + 'raw text');
  });

  it('same control message in a different space yields a different fingerprint', () => {
    const a = buildMessageFingerprint({
      nonce: 'n',
      content: removeMsg(ALICE),
      senderId: ALICE,
      spaceId: 'space-A',
      channelId: CHANNEL_ID,
    });
    const b = buildMessageFingerprint({
      nonce: 'n',
      content: removeMsg(ALICE),
      senderId: ALICE,
      spaceId: 'space-B',
      channelId: CHANNEL_ID,
    });
    expect(a).not.toBe(b);
  });
});

describe('isControlMessageType', () => {
  it.each(['remove-message', 'edit-message', 'pin', 'mute'])(
    'classifies %s as control',
    (t) => expect(isControlMessageType(t)).toBe(true)
  );
  it.each(['post', 'embed', 'sticker', 'reaction', 'thread', 'update-profile'])(
    'classifies %s as non-control',
    (t) => expect(isControlMessageType(t)).toBe(false)
  );
});

describe('computeMessageIdHex', () => {
  it('is SHA-256 hex (known vector)', () => {
    expect(computeMessageIdHex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('deriveInboxAddress', () => {
  it('matches the multiformats digest bytes desktop encodes', async () => {
    const publicKeyHex = 'deadbeef00112233445566778899aabbccddeeff';
    const keyBytes = Uint8Array.from(
      publicKeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    const digest = await mfSha256.digest(keyBytes);
    expect(deriveInboxAddress(publicKeyHex)).toBe(
      base58btc.baseEncode(digest.bytes)
    );
  });
});

describe('resolveVerifiedSender', () => {
  const pub = 'deadbeef00112233445566778899aabbccddeeff';
  const inbox = deriveInboxAddress(pub);
  const member = (over: Partial<SpaceMember>): SpaceMember =>
    ({ address: ALICE, inbox_address: inbox, ...over } as SpaceMember);

  it('resolves the member whose registered inbox matches the key', () => {
    expect(resolveVerifiedSender(pub, [member({})])).toBe(ALICE);
  });

  it('returns null when no member registered this key (fail closed)', () => {
    expect(
      resolveVerifiedSender(pub, [member({ inbox_address: 'other' })])
    ).toBeNull();
  });

  it('returns null for kicked members', () => {
    expect(resolveVerifiedSender(pub, [member({ isKicked: true })])).toBeNull();
  });

  it('falls back to the user_address alias', () => {
    expect(
      resolveVerifiedSender(pub, [
        member({ address: undefined as unknown as string, user_address: BOB }),
      ])
    ).toBe(BOB);
  });

  it('returns null for an empty key', () => {
    expect(resolveVerifiedSender('', [member({})])).toBeNull();
  });
});

describe('authorizeControlMessage — remove-message', () => {
  it('honors a delete from a verified role holder', () => {
    const v = authorizeControlMessage({
      content: removeMsg(BOB),
      verifiedSender: asVerified(BOB),
      space: spaceWith([role([BOB], ['message:delete'])]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: true, reason: 'ok' });
  });

  it('honors deleting your own message without any role', () => {
    const v = authorizeControlMessage({
      content: removeMsg(ALICE),
      verifiedSender: asVerified(ALICE),
      space: spaceWith([]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: true, reason: 'ok-own-message' });
  });

  it('drops a delete whose claimed senderId differs from the verified sender (spoof)', () => {
    const v = authorizeControlMessage({
      content: removeMsg(BOB), // claims to be Bob the moderator
      verifiedSender: asVerified(MALLORY), // key belongs to Mallory
      space: spaceWith([role([BOB], ['message:delete'])]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: false, reason: 'senderid-mismatch' });
  });

  it('drops an unsigned/unresolvable delete (fail closed, incl. missing member row)', () => {
    const v = authorizeControlMessage({
      content: removeMsg(BOB),
      verifiedSender: null,
      space: spaceWith([role([BOB], ['message:delete'])]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: false, reason: 'unsigned-control-rejected' });
  });

  it('drops a verified delete from a member with no role and no authorship', () => {
    const v = authorizeControlMessage({
      content: removeMsg(MALLORY),
      verifiedSender: asVerified(MALLORY),
      space: spaceWith([role([BOB], ['message:delete'])]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: false, reason: 'no-permission' });
  });

  it('treats a delete of a locally-unknown message as a no-op allow', () => {
    const v = authorizeControlMessage({
      content: removeMsg(ALICE),
      verifiedSender: asVerified(ALICE),
      space: spaceWith([]),
      channel: undefined,
      targetMessage: undefined,
    });
    expect(v).toEqual({ allowed: true, reason: 'ok-target-missing-noop' });
  });
});

describe('authorizeControlMessage — edit-message', () => {
  it('honors a verified edit of your own message', () => {
    const v = authorizeControlMessage({
      content: editMsg(ALICE),
      verifiedSender: asVerified(ALICE),
      space: spaceWith([]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: true, reason: 'ok' });
  });

  it("drops a verified edit of someone else's message", () => {
    const v = authorizeControlMessage({
      content: editMsg(MALLORY),
      verifiedSender: asVerified(MALLORY),
      space: spaceWith([]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: false, reason: 'edit-not-own-message' });
  });

  it('drops an edit whose claimed senderId differs from the verified sender (spoof)', () => {
    const v = authorizeControlMessage({
      content: editMsg(ALICE), // claims to be Alice
      verifiedSender: asVerified(MALLORY),
      space: spaceWith([]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: false, reason: 'senderid-mismatch' });
  });

  it('accepts an unsigned edit of an UNSIGNED own message in a repudiable space (inherit rule)', () => {
    const v = authorizeControlMessage({
      content: editMsg(ALICE),
      verifiedSender: null,
      space: spaceWith([], true),
      channel: undefined,
      targetMessage: message(ALICE, false),
    });
    expect(v).toEqual({
      allowed: true,
      reason: 'ok-unsigned-edit-of-unsigned-own-message',
    });
  });

  it('drops an unsigned edit of a SIGNED message even in a repudiable space', () => {
    const v = authorizeControlMessage({
      content: editMsg(ALICE),
      verifiedSender: null,
      space: spaceWith([], true),
      channel: undefined,
      targetMessage: message(ALICE, true),
    });
    expect(v).toEqual({ allowed: false, reason: 'unsigned-edit-rejected' });
  });

  it('drops an unsigned edit in a NON-repudiable space', () => {
    const v = authorizeControlMessage({
      content: editMsg(ALICE),
      verifiedSender: null,
      space: spaceWith([], false),
      channel: undefined,
      targetMessage: message(ALICE, false),
    });
    expect(v).toEqual({ allowed: false, reason: 'unsigned-edit-rejected' });
  });

  it("drops an unsigned edit claiming someone else's unsigned message", () => {
    const v = authorizeControlMessage({
      content: editMsg(MALLORY),
      verifiedSender: null,
      space: spaceWith([], true),
      channel: undefined,
      targetMessage: message(ALICE, false),
    });
    expect(v).toEqual({ allowed: false, reason: 'unsigned-edit-rejected' });
  });

  it('drops an edit whose target is missing', () => {
    const v = authorizeControlMessage({
      content: editMsg(ALICE),
      verifiedSender: asVerified(ALICE),
      space: spaceWith([]),
      channel: undefined,
      targetMessage: undefined,
    });
    expect(v).toEqual({ allowed: false, reason: 'edit-target-missing' });
  });
});

describe('authorizeControlMessage — pin / mute', () => {
  const pinMsg = (senderId: string): PinMessage => ({
    senderId,
    type: 'pin',
    targetMessageId: 'msg-1',
    action: 'pin',
  });
  const muteMsg = (senderId: string): MuteMessage => ({
    senderId,
    type: 'mute',
    targetUserId: ALICE,
    muteId: 'm1',
    timestamp: 1,
    action: 'mute',
  });

  it('honors pin from a verified message:pin role holder', () => {
    const v = authorizeControlMessage({
      content: pinMsg(BOB),
      verifiedSender: asVerified(BOB),
      space: spaceWith([role([BOB], ['message:pin'])]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: true, reason: 'ok' });
  });

  it('drops unsigned pin', () => {
    const v = authorizeControlMessage({
      content: pinMsg(BOB),
      verifiedSender: null,
      space: spaceWith([role([BOB], ['message:pin'])]),
      channel: undefined,
      targetMessage: message(ALICE),
    });
    expect(v).toEqual({ allowed: false, reason: 'unsigned-control-rejected' });
  });

  it('honors mute from a verified user:mute role holder, drops others', () => {
    const space = spaceWith([role([BOB], ['user:mute'])]);
    expect(
      authorizeControlMessage({
        content: muteMsg(BOB),
        verifiedSender: asVerified(BOB),
        space,
        channel: undefined,
      })
    ).toEqual({ allowed: true, reason: 'ok' });
    expect(
      authorizeControlMessage({
        content: muteMsg(MALLORY),
        verifiedSender: asVerified(MALLORY),
        space,
        channel: undefined,
      })
    ).toEqual({ allowed: false, reason: 'no-permission' });
  });
});

describe('shouldSignEdit (inherit rule)', () => {
  it('signs edits of signed messages', () => {
    expect(shouldSignEdit(message(ALICE, true))).toBe(true);
  });
  it('does not sign edits of unsigned messages', () => {
    expect(shouldSignEdit(message(ALICE, false))).toBe(false);
  });
});

describe('verifyAndResolveSender', () => {
  const ALICE_PUB = '11'.repeat(32);
  const ALICE_INBOX = deriveInboxAddress(ALICE_PUB);
  const SIG = 'ab'.repeat(114);

  const members: SpaceMember[] = [
    { user_address: ALICE, address: ALICE, inbox_address: ALICE_INBOX },
  ] as unknown as SpaceMember[];

  /** Stub verifier: records calls so we can assert crypto actually ran. */
  const makeProvider = (result: boolean) => {
    const calls: string[][] = [];
    return {
      calls,
      verifyEd448: async (pk: string, msg: string, sig: string) => {
        calls.push([pk, msg, sig]);
        return result;
      },
    };
  };

  /** A post whose messageId genuinely matches its own fingerprint. */
  const signedPost = (over: Partial<VerifiableSpaceMessage> = {}) => {
    const content = { type: 'post', senderId: ALICE, text: 'hi' } as PostMessage;
    const nonce = 'n-1';
    return {
      nonce,
      messageId: computeMessageIdHex(
        buildMessageFingerprint({
          nonce,
          content,
          senderId: ALICE,
          spaceId: SPACE_ID,
          channelId: CHANNEL_ID,
        })
      ),
      content,
      publicKey: ALICE_PUB,
      signature: SIG,
      ...over,
    } as VerifiableSpaceMessage;
  };

  const run = (
    msg: VerifiableSpaceMessage,
    provider: Pick<SigningProvider, 'verifyEd448'>
  ) =>
    verifyAndResolveSender({
      message: msg,
      scopeSpaceId: SPACE_ID,
      scopeChannelId: CHANNEL_ID,
      members,
      provider,
    });

  it('resolves the signer when the signature checks out', async () => {
    const provider = makeProvider(true);
    expect(await run(signedPost(), provider)).toEqual({
      signatureValid: true,
      reason: 'ok',
      sender: ALICE,
    });
    expect(provider.calls).toHaveLength(1);
  });

  it('THE INVARIANT: a real member key with a bad signature resolves to nobody', async () => {
    // The whole point. Alice's public key is public — it rides on every signed
    // message she sends — so possessing it must prove nothing on its own.
    const provider = makeProvider(false);
    const result = await run(signedPost(), provider);
    expect(result).toEqual({ signatureValid: false, reason: 'bad-signature' });
    // Absent, not merely null: the failure branch of the union carries no
    // sender at all, so there is nothing for a caller to read by mistake.
    expect(result.sender).toBeUndefined();
  });

  it('rejects an unsigned message without calling the verifier', async () => {
    const provider = makeProvider(true);
    expect(
      await run(
        signedPost({ publicKey: undefined, signature: undefined }),
        provider
      )
    ).toEqual({ signatureValid: false, reason: 'no-signature' });
    expect(provider.calls).toHaveLength(0);
  });

  it('rejects a messageId that is not the fingerprint hash, before verifying', async () => {
    // Guards against lifting a valid signature onto different content.
    const provider = makeProvider(true);
    expect(await run(signedPost({ messageId: 'deadbeef' }), provider)).toEqual({
      signatureValid: false,
      reason: 'messageid-mismatch',
    });
    expect(provider.calls).toHaveLength(0);
  });

  it('a valid signature from an unknown key is VALID but resolves to nobody', async () => {
    // Both halves matter and must stay distinguishable: handlers that bootstrap
    // a missing member row key off `sender === null`, and would be wrong to
    // treat it as "signature failed".
    const provider = makeProvider(true);
    const result = await run(
      signedPost({ publicKey: '99'.repeat(32) }),
      provider
    );
    expect(result.signatureValid).toBe(true);
    expect(result.sender).toBeNull();
  });

  it('a kicked member resolves to nobody even with a valid signature', async () => {
    // The fused path delegates the member gate to resolveVerifiedSender. Pinned
    // here too so the delegation itself cannot drift: a kicked member holds
    // working key material, so the signature is genuinely valid and only the
    // membership check stands between them and acting on the space.
    const provider = makeProvider(true);
    const result = await verifyAndResolveSender({
      message: signedPost(),
      scopeSpaceId: SPACE_ID,
      scopeChannelId: CHANNEL_ID,
      members: [
        {
          user_address: ALICE,
          address: ALICE,
          inbox_address: ALICE_INBOX,
          isKicked: true,
        },
      ] as unknown as SpaceMember[],
      provider,
    });
    expect(result.signatureValid).toBe(true);
    expect(result.sender).toBeNull();
  });

  it('degrades to a verdict on malformed hex rather than throwing', async () => {
    // This runs inside the receive path's broad try/catch, where a throw would
    // be swallowed and silently drop the message — a bug class this codebase
    // has shipped before (see 2026-06-13-space-members-missing-no-join-row).
    const provider = makeProvider(false);
    await expect(
      run(signedPost({ publicKey: 'zz zz', signature: 'nothex' }), provider)
    ).resolves.toMatchObject({ signatureValid: false });
  });

  it('signs over the raw digest bytes, not the hex string', async () => {
    // Wire-format pin: both apps sign these exact bytes. A change here breaks
    // verification silently and cross-platform.
    const provider = makeProvider(true);
    const msg = signedPost();
    await run(msg, provider);
    const [publicKeyB64, messageB64, signatureB64] = provider.calls[0];
    expect(messageB64).toBe(
      Buffer.from(msg.messageId, 'hex').toString('base64')
    );
    expect(publicKeyB64).toBe(Buffer.from(ALICE_PUB, 'hex').toString('base64'));
    expect(signatureB64).toBe(Buffer.from(SIG, 'hex').toString('base64'));
  });

  it('binds control types to the scope passed in, not the one on the wire', async () => {
    // A control message signed for another space must not verify here.
    const content = {
      type: 'remove-message',
      senderId: ALICE,
      removeMessageId: 'm-1',
    } as RemoveMessage;
    const nonce = 'n-scope';
    const signedForOtherSpace = {
      nonce,
      content,
      publicKey: ALICE_PUB,
      signature: SIG,
      messageId: computeMessageIdHex(
        buildMessageFingerprint({
          nonce,
          content,
          senderId: ALICE,
          spaceId: 'other-space',
          channelId: CHANNEL_ID,
        })
      ),
    } as VerifiableSpaceMessage;

    const provider = makeProvider(true);
    const result = await run(signedForOtherSpace, provider);
    expect(result.reason).toBe('messageid-mismatch');
    expect(result.sender).toBeUndefined();
  });
});

describe('the verification list and the fingerprint list are separate', () => {
  it("requires a signature for 'thread'", () => {
    expect(requiresVerifiedSignature('thread')).toBe(true);
  });

  it("still requires one for all four original control types", () => {
    for (const type of ['remove-message', 'edit-message', 'pin', 'mute']) {
      expect(requiresVerifiedSignature(type)).toBe(true);
    }
  });

  it('leaves ordinary posts alone — deniability is a feature, not a gap', () => {
    expect(requiresVerifiedSignature('post')).toBe(false);
  });

  /**
   * THE WIRE GUARD. `buildMessageFingerprint` keys off `isControlMessageType`,
   * so if 'thread' ever joins THAT list every thread messageId changes and old
   * clients reject frames from new ones. Hardening must stay on the other list.
   */
  it("does NOT put 'thread' on the fingerprint-scope list", () => {
    expect(isControlMessageType('thread')).toBe(false);
  });

  it('leaves a thread frame\'s messageId byte-identical across scopes', () => {
    const content = {
      type: 'thread' as const,
      senderId: ALICE,
      targetMessageId: 'msg-1',
      action: 'remove' as const,
      threadMeta: { threadId: 't1', createdBy: ALICE },
    };
    const base = { nonce: 'n1', content: content as never, senderId: ALICE };

    // A scope-bound type hashes differently per channel; 'thread' must not,
    // because that difference IS the compatibility break.
    const inCh1 = buildMessageFingerprint({
      ...base,
      spaceId: SPACE_ID,
      channelId: 'ch1',
    });
    const inCh2 = buildMessageFingerprint({
      ...base,
      spaceId: 'other-space',
      channelId: 'ch2',
    });
    expect(computeMessageIdHex(inCh1)).toBe(computeMessageIdHex(inCh2));
  });
});

describe('authorizeThreadAction', () => {
  const ACTIONS = [
    'create',
    'updateTitle',
    'close',
    'reopen',
    'updateSettings',
    'remove',
  ] as const;

  const spaceWithDeleteRole = (holder: string): Space =>
    ({ roles: [role([holder], ['message:delete'])] }) as unknown as Space;

  const verdict = (over: Partial<Parameters<typeof authorizeThreadAction>[0]>) =>
    authorizeThreadAction({
      action: 'remove',
      verifiedSender: ALICE as VerifiedSender,
      threadCreatedBy: ALICE,
      space: undefined,
      channel: undefined,
      ...over,
    });

  it.each(ACTIONS)('denies %s outright when nobody was verified', (action) => {
    const result = verdict({ action, verifiedSender: null });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unsigned-thread-rejected');
  });

  it.each(ACTIONS)('allows %s for the thread creator', (action) => {
    expect(verdict({ action }).allowed).toBe(true);
  });

  it.each(['close', 'reopen', 'updateSettings', 'remove'] as const)(
    'allows %s for a holder of message:delete who is not the creator',
    (action) => {
      const result = verdict({
        action,
        verifiedSender: MALLORY as VerifiedSender,
        threadCreatedBy: ALICE,
        space: spaceWithDeleteRole(MALLORY),
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ok-permission');
    }
  );

  it('lets no one but the creator rename a thread, moderator included', () => {
    const result = verdict({
      action: 'updateTitle',
      verifiedSender: MALLORY as VerifiedSender,
      threadCreatedBy: ALICE,
      space: spaceWithDeleteRole(MALLORY),
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not-thread-creator');
  });

  it.each(['close', 'reopen', 'updateSettings', 'remove'] as const)(
    'denies %s to a member with no role and no ownership',
    (action) => {
      const result = verdict({
        action,
        verifiedSender: MALLORY as VerifiedSender,
        threadCreatedBy: ALICE,
        space: spaceWithDeleteRole(BOB),
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no-permission');
    }
  );

  it('does not treat an unknown creator as matching an unknown sender', () => {
    const result = verdict({
      action: 'remove',
      verifiedSender: MALLORY as VerifiedSender,
      threadCreatedBy: undefined,
    });
    expect(result.allowed).toBe(false);
  });

  it('lets anyone verified open a thread — creation is not privileged', () => {
    const result = verdict({
      action: 'create',
      verifiedSender: MALLORY as VerifiedSender,
      threadCreatedBy: undefined,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok-new-thread');
  });

  it('isolates read-only channels to their managers', () => {
    // NB: the `role()` helper hardcodes roleId 'r1', so the manager role must
    // be a different id or the subject qualifies as a manager by accident.
    const readOnly = {
      isReadOnly: true,
      managerRoleIds: ['manager-role'],
    } as never;
    // Holds message:delete via a normal role, but is not a manager here.
    const result = verdict({
      action: 'remove',
      verifiedSender: MALLORY as VerifiedSender,
      threadCreatedBy: ALICE,
      space: { roles: [role([MALLORY], ['message:delete'])] } as unknown as Space,
      channel: readOnly,
    });
    expect(result.allowed).toBe(false);
  });
});

describe('shouldSignOutbound', () => {
  const base = {
    contentType: 'post',
    isRepudiable: true,
    isReadOnlyChannel: false,
    skipSigning: false,
  };

  it('signs everything when the space forbids deniability', () => {
    expect(
      shouldSignOutbound({ ...base, isRepudiable: false, skipSigning: true })
    ).toBe(true);
  });

  // THE DENIABILITY GUARD. If this ever goes red, the feature is broken:
  // a user who chose to send unsigned is being signed anyway.
  it('honors the per-message choice for an ordinary post', () => {
    expect(shouldSignOutbound({ ...base, skipSigning: true })).toBe(false);
    expect(shouldSignOutbound({ ...base, skipSigning: false })).toBe(true);
  });

  it.each(['remove-message', 'pin', 'mute', 'thread'])(
    'force-signs %s even when the sender asked not to',
    (contentType) => {
      expect(shouldSignOutbound({ ...base, contentType, skipSigning: true })).toBe(
        true
      );
    }
  );

  it('force-signs posts in a read-only channel', () => {
    expect(
      shouldSignOutbound({ ...base, isReadOnlyChannel: true, skipSigning: true })
    ).toBe(true);
  });

  it('leaves unknown//future non-privileged types deniable', () => {
    expect(
      shouldSignOutbound({ ...base, contentType: 'sticker', skipSigning: true })
    ).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { sha256 as mfSha256 } from 'multiformats/hashes/sha2';
import { base58btc } from 'multiformats/bases/base58';
import {
  authorizeControlMessage,
  buildMessageFingerprint,
  computeMessageIdHex,
  deriveInboxAddress,
  isControlMessageType,
  resolveVerifiedSender,
  shouldSignEdit,
  type VerifiedSender,
} from './messageAuth';
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

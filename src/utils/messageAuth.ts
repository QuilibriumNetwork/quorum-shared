import { sha256 } from '@noble/hashes/sha2';
import { base58btc } from 'multiformats/bases/base58';
import { canonicalize } from './canonicalize';
import { createChannelPermissionChecker } from './channelPermissions';
import { bytesToBase64, bytesToHex, hexToBytes } from './encoding';
import type { SigningProvider } from '../signing';
import type {
  Channel,
  EditMessage,
  Message,
  MuteMessage,
  PinMessage,
  RemoveMessage,
  Space,
  SpaceMember,
  SpaceMemberDevice,
} from '../types';

/**
 * Receive-side authorization for space control messages.
 *
 * Space group encryption does not identify the per-message author, and the
 * plaintext `content.senderId` is written by the sender's client (spoofable).
 * The only per-message sender proof is the ed448 signature over the message
 * fingerprint. This module is the single source of truth both apps use to:
 *  - build the signed fingerprint (wire format — must be byte-identical
 *    on desktop and mobile, send and receive),
 *  - derive the sender identity FROM the verified signing key (never from
 *    payload senderId),
 *  - decide whether a control message is honored.
 *
 * Ed448 verification itself stays in each app (WASM on desktop, native on
 * mobile); callers pass the verified public key here only after the signature
 * checked out against the fingerprint.
 */

/** Control types require a verified signature regardless of space repudiability. */
export const CONTROL_MESSAGE_TYPES = [
  'remove-message',
  'edit-message',
  'pin',
  'mute',
] as const;

export type ControlMessageType = (typeof CONTROL_MESSAGE_TYPES)[number];

export type ControlMessageContent =
  | RemoveMessage
  | EditMessage
  | PinMessage
  | MuteMessage;

export function isControlMessageType(
  type: string
): type is ControlMessageType {
  return (CONTROL_MESSAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Canonical fingerprint string whose SHA-256 is the messageId — the value that
 * gets ed448-signed. Control types additionally bind spaceId/channelId so a
 * signed control message can't be replayed into another space/channel.
 * Non-control types keep the legacy format (no scope binding): their messageId
 * is long-lived identity and must not change.
 */
export function buildMessageFingerprint(params: {
  nonce: string;
  content: Parameters<typeof canonicalize>[0];
  senderId: string;
  spaceId: string;
  channelId: string;
}): string {
  const { nonce, content, senderId, spaceId, channelId } = params;
  const type = typeof content === 'string' ? 'post' : content.type;
  const scope = isControlMessageType(type) ? spaceId + channelId : '';
  return nonce + type + senderId + scope + canonicalize(content);
}

/** SHA-256 of a fingerprint as lowercase hex (the wire messageId). Sync, cross-platform. */
export function computeMessageIdHex(fingerprint: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(fingerprint)));
}

/**
 * Inbox address derivation: base58btc(multihash(sha256(publicKey))).
 * Byte-identical to desktop's `base58btc.baseEncode(sha256.digest(pubKey).bytes)`
 * (multiformats digest bytes = 0x12 0x20 prefix + raw sha256).
 */
export function deriveInboxAddress(publicKeyHex: string): string {
  const keyBytes = Uint8Array.from(hexToBytes(publicKeyHex));
  const digest = sha256(keyBytes);
  const multihash = new Uint8Array(2 + digest.length);
  multihash[0] = 0x12; // sha2-256 code
  multihash[1] = 0x20; // digest length (32)
  multihash.set(digest, 2);
  return base58btc.baseEncode(multihash);
}

/**
 * A sender identity proven by a verified signature. Only producible via
 * resolveVerifiedSender — auth checks typed against this cannot compile with a
 * raw payload `content.senderId`.
 */
export type VerifiedSender = string & { readonly __verifiedSender: unique symbol };

/**
 * Map a signature-verified public key to the member who registered it.
 * REVERSE lookup (key → inbox address → member), never a lookup by claimed
 * senderId: that shape is bypassable when the claimed member's row is missing
 * locally. No match (or kicked member) → null → callers must fail closed.
 *
 * `deviceKeys` is OPTIONAL and additive (older callers keep the two-arg form):
 * when a message's signing key is not a member's join-bound `inbox_address`, it
 * may still resolve via a per-device signing key ADMITTED through a
 * master-signed statement (see utils/deviceKeys.ts). The admission only carries
 * authority through to a member row that exists and is not kicked — so the
 * member gate stays fail-closed for both paths, and a revoked admission never
 * resolves.
 */
export function resolveVerifiedSender(
  publicKeyHex: string,
  members: SpaceMember[],
  deviceKeys?: SpaceMemberDevice[]
): VerifiedSender | null {
  if (!publicKeyHex) return null;
  const inboxAddress = deriveInboxAddress(publicKeyHex);

  // Path 1: the join-bound member row (unchanged behavior).
  const member = members.find(
    (m) => m.inbox_address === inboxAddress && !m.isKicked
  );
  if (member) {
    const address = member.address || member.user_address;
    return address ? (address as VerifiedSender) : null;
  }

  // Path 2: an admitted per-device signing key → its owning member row.
  if (deviceKeys?.length) {
    const device = deviceKeys.find(
      (d) => d.inboxAddress === inboxAddress && !d.revoked
    );
    if (device) {
      const owner = members.find(
        (m) =>
          (m.address || m.user_address) === device.userAddress && !m.isKicked
      );
      const address = owner?.address || owner?.user_address;
      if (address) return address as VerifiedSender;
    }
  }

  return null;
}

/**
 * Outcome of verifying a message's signature AND resolving who signed it.
 *
 * The two fields answer different questions and must not be conflated:
 *  - `signatureValid` — did the ed448 check pass? A `false` here means the
 *    message proves nothing about its author.
 *  - `sender` — WHO the verified key belongs to. Null is legitimate even when
 *    `signatureValid` is true: the key may belong to a member whose join
 *    broadcast never reached us, which some handlers accept as a bootstrap.
 *
 * The invariant this type exists to carry: `sender` is non-null ONLY when
 * `signatureValid` is true. Callers that need proof of authorship must test
 * `signatureValid`, never `sender !== null` alone.
 */
export type VerifiedSenderResult =
  | {
      signatureValid: false;
      reason: 'no-signature' | 'messageid-mismatch' | 'bad-signature';
      /** Structurally absent: nothing was proven, so there is nobody to name. */
      sender?: undefined;
    }
  | {
      signatureValid: true;
      reason: 'ok';
      sender: VerifiedSender | null;
    };

/** The fields of a space message that authorship depends on. */
export type VerifiableSpaceMessage = Pick<
  Message,
  'nonce' | 'messageId' | 'content' | 'publicKey' | 'signature'
>;

/**
 * Verify a space message's ed448 signature and, only if it holds, resolve the
 * member who signed it. THE ONLY SAFE WAY TO OBTAIN A `VerifiedSender`.
 *
 * WHY THIS EXISTS. `resolveVerifiedSender` runs no cryptography — it is a
 * reverse lookup that assumes its caller already verified. When those two steps
 * live in different places, joined only by a comment, any handler that reaches
 * the lookup without satisfying the distant verify gate receives an identity
 * that looks proven and is not. A signing key is PUBLIC (it rides on every
 * signed message), so pasting a victim's key next to garbage signature bytes is
 * free; only checking the signature costs an attacker anything. Fusing the two
 * makes the unverified path unrepresentable rather than merely discouraged.
 *
 * Ed448 stays platform-side (WASM on desktop, native on mobile) and arrives via
 * `provider`, the same injection `verifyDeviceKeyStatement` already uses.
 *
 * SCOPE BINDING: `scopeSpaceId`/`scopeChannelId` should be the scope the action
 * will actually APPLY in, not the scope the wire claims, so a signature can
 * never attest one place while taking effect in another. For non-control types
 * these are absent from the fingerprint and the choice is inert.
 */
export async function verifyAndResolveSender(params: {
  message: VerifiableSpaceMessage;
  scopeSpaceId: string;
  scopeChannelId: string;
  members: SpaceMember[];
  deviceKeys?: SpaceMemberDevice[];
  provider: Pick<SigningProvider, 'verifyEd448'>;
}): Promise<VerifiedSenderResult> {
  const {
    message,
    scopeSpaceId,
    scopeChannelId,
    members,
    deviceKeys,
    provider,
  } = params;

  const fail = (
    reason: Extract<VerifiedSenderResult, { signatureValid: false }>['reason']
  ): VerifiedSenderResult => ({ signatureValid: false, reason });

  if (!message.publicKey || !message.signature) return fail('no-signature');

  // Raw digest bytes, not the hex string: the ed448 signature is over these.
  // Both apps sign the same bytes, so any change here breaks verification
  // silently and cross-platform.
  const digest = sha256(
    new TextEncoder().encode(
      buildMessageFingerprint({
        nonce: message.nonce,
        // `canonicalize` enumerates a narrower union than `MessageContent`
        // (it predates types like EventMessage), but it only walks the object
        // generically. Every desktop call site casts here for the same reason;
        // widening canonicalize's signature is a separate cleanup.
        content: message.content as Parameters<
          typeof buildMessageFingerprint
        >[0]['content'],
        senderId: message.content.senderId,
        spaceId: scopeSpaceId,
        channelId: scopeChannelId,
      })
    )
  );

  // The wire messageId must be the fingerprint's own hash, so a signature
  // cannot be lifted onto different content.
  if (message.messageId !== bytesToHex(digest)) {
    return fail('messageid-mismatch');
  }

  const valid = await provider.verifyEd448(
    bytesToBase64(hexToBytes(message.publicKey)),
    bytesToBase64(digest),
    bytesToBase64(hexToBytes(message.signature))
  );
  if (!valid) return fail('bad-signature');

  return {
    signatureValid: true,
    reason: 'ok',
    sender: resolveVerifiedSender(message.publicKey, members, deviceKeys),
  };
}

export interface ControlMessageVerdict {
  allowed: boolean;
  reason:
    | 'ok'
    | 'ok-own-message'
    | 'ok-unsigned-edit-of-unsigned-own-message'
    | 'ok-target-missing-noop'
    | 'unsigned-control-rejected'
    | 'unsigned-edit-rejected'
    | 'senderid-mismatch'
    | 'edit-target-missing'
    | 'edit-not-own-message'
    | 'pin-target-missing'
    | 'no-permission'
    | 'unknown-control-type';
}

const allow = (reason: ControlMessageVerdict['reason']): ControlMessageVerdict => ({
  allowed: true,
  reason,
});
const deny = (reason: ControlMessageVerdict['reason']): ControlMessageVerdict => ({
  allowed: false,
  reason,
});

/**
 * The single receive-side verdict for space control messages. Both apps must
 * route remove/edit/pin/mute acceptance through this so they can never disagree
 * about whether a control message is honored.
 *
 * `verifiedSender` is null when the message was unsigned, the signature was
 * invalid, or the key matched no member — all fail closed, with ONE deliberate
 * exception: in a repudiable space, an unsigned edit of an UNSIGNED message is
 * accepted when the claimed sender matches the target's author. Unsigned
 * content there never had authenticated authorship (deniability by owner
 * choice), so its edits stay at the same trust level; signed content always
 * requires signed, verified edits (edit inherit rule).
 */
export function authorizeControlMessage(params: {
  content: ControlMessageContent;
  verifiedSender: VerifiedSender | null;
  space: Space | undefined;
  channel: Channel | undefined;
  targetMessage?: Message;
}): ControlMessageVerdict {
  const { content, verifiedSender, space, channel, targetMessage } = params;
  const checker = verifiedSender
    ? createChannelPermissionChecker({
        userAddress: verifiedSender,
        isSpaceOwner: false, // ownership is receiver-unverifiable by design
        space,
        channel,
      })
    : null;

  switch (content.type) {
    case 'edit-message': {
      if (!targetMessage) return deny('edit-target-missing');
      if (!verifiedSender) {
        const repudiable = !!space?.isRepudiable;
        const targetUnsigned = !targetMessage.signature;
        const claimsAuthor =
          content.senderId === targetMessage.content.senderId;
        return repudiable && targetUnsigned && claimsAuthor
          ? allow('ok-unsigned-edit-of-unsigned-own-message')
          : deny('unsigned-edit-rejected');
      }
      if (content.senderId !== verifiedSender) return deny('senderid-mismatch');
      if (targetMessage.content.senderId !== verifiedSender)
        return deny('edit-not-own-message');
      return allow('ok');
    }

    case 'remove-message': {
      if (!verifiedSender || !checker) return deny('unsigned-control-rejected');
      if (content.senderId !== verifiedSender) return deny('senderid-mismatch');
      // Target unknown locally: honoring it is a no-op removal, not attack surface.
      if (!targetMessage) return allow('ok-target-missing-noop');
      if (targetMessage.content.senderId === verifiedSender)
        return allow('ok-own-message');
      return checker.canDeleteMessage(targetMessage)
        ? allow('ok')
        : deny('no-permission');
    }

    case 'pin': {
      if (!verifiedSender || !checker) return deny('unsigned-control-rejected');
      if (content.senderId !== verifiedSender) return deny('senderid-mismatch');
      if (!targetMessage) return deny('pin-target-missing');
      return checker.canPinMessage(targetMessage)
        ? allow('ok')
        : deny('no-permission');
    }

    case 'mute': {
      if (!verifiedSender || !checker) return deny('unsigned-control-rejected');
      if (content.senderId !== verifiedSender) return deny('senderid-mismatch');
      return checker.canMuteUser() ? allow('ok') : deny('no-permission');
    }

    default:
      return deny('unknown-control-type');
  }
}

/**
 * Edit inherit rule: an edit is signed iff the message it edits was signed, so
 * a deliberately-unsigned (deniable) message never silently gains a signature.
 * Callers: `skipSigning = !shouldSignEdit(original)`.
 */
export function shouldSignEdit(
  original: Pick<Message, 'signature'>
): boolean {
  return !!original.signature;
}

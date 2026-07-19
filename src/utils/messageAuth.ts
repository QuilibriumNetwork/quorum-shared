import { sha256 } from '@noble/hashes/sha2';
import { base58btc } from 'multiformats/bases/base58';
import { canonicalize } from './canonicalize';
import { createChannelPermissionChecker } from './channelPermissions';
import { bytesToHex, hexToBytes } from './encoding';
import type {
  Channel,
  EditMessage,
  Message,
  MuteMessage,
  PinMessage,
  RemoveMessage,
  Space,
  SpaceMember,
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
 */
export function resolveVerifiedSender(
  publicKeyHex: string,
  members: SpaceMember[]
): VerifiedSender | null {
  if (!publicKeyHex) return null;
  const inboxAddress = deriveInboxAddress(publicKeyHex);
  const member = members.find(
    (m) => m.inbox_address === inboxAddress && !m.isKicked
  );
  if (!member) return null;
  const address = member.address || member.user_address;
  return address ? (address as VerifiedSender) : null;
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

import { describe, it, expect } from 'vitest';
import {
  getConversationSetting,
  setConversationSetting,
  mergeConversationSettings,
  type ConversationSettingsMap,
} from './conversationSettingsUtils';

describe('getConversationSetting', () => {
  const map: ConversationSettingsMap = {
    'alice/inbox': { deliveryReceipts: true, updatedAt: 5 },
  };

  it('returns the override when set', () => {
    expect(getConversationSetting(map, 'alice/inbox', 'deliveryReceipts')).toBe(true);
  });

  it('returns undefined for an unset field (inherit)', () => {
    expect(getConversationSetting(map, 'alice/inbox', 'readReceipts')).toBeUndefined();
  });

  it('returns undefined for an unknown conversation', () => {
    expect(getConversationSetting(map, 'bob/inbox', 'deliveryReceipts')).toBeUndefined();
  });

  it('returns undefined for an undefined map', () => {
    expect(getConversationSetting(undefined, 'alice/inbox', 'deliveryReceipts')).toBeUndefined();
  });
});

describe('setConversationSetting', () => {
  it('creates a new entry with a bumped updatedAt', () => {
    const result = setConversationSetting(undefined, 'alice/inbox', { isRepudiable: true }, 100);
    expect(result['alice/inbox']).toEqual({ isRepudiable: true, updatedAt: 100 });
  });

  it('merges into an existing entry and bumps updatedAt', () => {
    const initial: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 10 },
    };
    const result = setConversationSetting(initial, 'alice/inbox', { readReceipts: true }, 20);
    expect(result['alice/inbox']).toEqual({
      deliveryReceipts: true,
      readReceipts: true,
      updatedAt: 20,
    });
  });

  it('clears a field when the patch value is undefined (reset that field)', () => {
    const initial: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, readReceipts: true, updatedAt: 10 },
    };
    const result = setConversationSetting(
      initial,
      'alice/inbox',
      { readReceipts: undefined },
      20
    );
    expect(result['alice/inbox']).toEqual({ deliveryReceipts: true, updatedAt: 20 });
  });

  it('retains an empty-but-timestamped entry when all fields are reset (tombstone marker)', () => {
    const initial: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, readReceipts: true, updatedAt: 10 },
    };
    const result = setConversationSetting(
      initial,
      'alice/inbox',
      { deliveryReceipts: undefined, readReceipts: undefined },
      30
    );
    expect(result['alice/inbox']).toEqual({ updatedAt: 30 });
  });

  it('does not mutate the input map', () => {
    const initial: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 10 },
    };
    const snapshot = JSON.parse(JSON.stringify(initial));
    setConversationSetting(initial, 'alice/inbox', { readReceipts: true }, 20);
    expect(initial).toEqual(snapshot);
  });

  it('does not touch other conversations', () => {
    const initial: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 10 },
      'bob/inbox': { isRepudiable: true, updatedAt: 11 },
    };
    const result = setConversationSetting(initial, 'alice/inbox', { readReceipts: true }, 20);
    expect(result['bob/inbox']).toEqual({ isRepudiable: true, updatedAt: 11 });
  });
});

describe('mergeConversationSettings', () => {
  it('keeps the entry with the higher updatedAt', () => {
    const local: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: false, updatedAt: 10 },
    };
    const remote: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 20 },
    };
    expect(mergeConversationSettings(local, remote)['alice/inbox']).toEqual({
      deliveryReceipts: true,
      updatedAt: 20,
    });
  });

  it('keeps local when local is newer', () => {
    const local: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 30 },
    };
    const remote: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: false, updatedAt: 20 },
    };
    expect(mergeConversationSettings(local, remote)['alice/inbox']).toEqual({
      deliveryReceipts: true,
      updatedAt: 30,
    });
  });

  it('keeps local on a tie (equal updatedAt → prefer local)', () => {
    const local: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 10 },
    };
    const remote: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: false, updatedAt: 10 },
    };
    expect(mergeConversationSettings(local, remote)['alice/inbox']).toEqual({
      deliveryReceipts: true,
      updatedAt: 10,
    });
  });

  it('unions entries that exist on only one side', () => {
    const local: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 10 },
    };
    const remote: ConversationSettingsMap = {
      'bob/inbox': { isRepudiable: true, updatedAt: 11 },
    };
    const result = mergeConversationSettings(local, remote);
    expect(result['alice/inbox']).toEqual({ deliveryReceipts: true, updatedAt: 10 });
    expect(result['bob/inbox']).toEqual({ isRepudiable: true, updatedAt: 11 });
  });

  it('lets a newer empty (reset) entry win over an older non-empty one', () => {
    const local: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, readReceipts: true, updatedAt: 10 },
    };
    const remote: ConversationSettingsMap = {
      'alice/inbox': { updatedAt: 20 }, // reset-to-global marker
    };
    expect(mergeConversationSettings(local, remote)['alice/inbox']).toEqual({ updatedAt: 20 });
  });

  it('treats a missing updatedAt as oldest (0)', () => {
    const local: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: false }, // no updatedAt
    };
    const remote: ConversationSettingsMap = {
      'alice/inbox': { deliveryReceipts: true, updatedAt: 1 },
    };
    expect(mergeConversationSettings(local, remote)['alice/inbox']).toEqual({
      deliveryReceipts: true,
      updatedAt: 1,
    });
  });

  it('handles undefined inputs', () => {
    expect(mergeConversationSettings(undefined, undefined)).toEqual({});
    expect(mergeConversationSettings({ a: { updatedAt: 1 } }, undefined)).toEqual({
      a: { updatedAt: 1 },
    });
    expect(mergeConversationSettings(undefined, { a: { updatedAt: 1 } })).toEqual({
      a: { updatedAt: 1 },
    });
  });

  it('does not mutate either input', () => {
    const local: ConversationSettingsMap = { 'alice/inbox': { deliveryReceipts: true, updatedAt: 10 } };
    const remote: ConversationSettingsMap = { 'alice/inbox': { deliveryReceipts: false, updatedAt: 20 } };
    const localSnap = JSON.parse(JSON.stringify(local));
    const remoteSnap = JSON.parse(JSON.stringify(remote));
    mergeConversationSettings(local, remote);
    expect(local).toEqual(localSnap);
    expect(remote).toEqual(remoteSnap);
  });
});

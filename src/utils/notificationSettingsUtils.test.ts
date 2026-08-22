/**
 * Per-space notification settings must survive a PARTIALLY-WRITTEN record.
 *
 * `SpaceNotificationSettings.enabledNotificationTypes` is declared required, so
 * every reader treated it as guaranteed. It is not: the value arrives from an
 * untyped synced config blob, and quorum-mobile's per-space mute writer
 * (`setSpaceMuted`) persists `{ ...(prev[spaceId] ?? {}), isMuted }` — for a
 * space with no prior settings that is `{ isMuted }` with no array at all. The
 * record syncs to desktop, where `?? getDefaultNotificationSettings()` does not
 * fire (the record is truthy) and the missing array reaches `.includes()`.
 *
 * Observed in production as `Cannot read properties of undefined (reading
 * 'includes')` from the reply-count hooks, alongside the fatal
 * `...(reading 'filter')` that took down the channel route.
 *
 * Every case below passes a record that EXISTS but is incomplete — the shape a
 * `!settings` guard cannot catch.
 */
import { describe, it, expect } from 'vitest';
import {
  getDefaultNotificationSettings,
  isNotificationTypeEnabled,
  hasEnabledNotificationTypes,
  normalizeSpaceNotificationSettings,
} from './notificationSettingsUtils';
import type { SpaceNotificationSettings } from '../types/notifications';

const SPACE = 'space-1';
const ALL_TYPES = ['mention-you', 'mention-everyone', 'mention-roles', 'reply'];

/** The exact record quorum-mobile's setSpaceMuted writes for a fresh space. */
const mobileMuteRecord = (isMuted: boolean) =>
  ({ isMuted }) as unknown as SpaceNotificationSettings;

describe('isNotificationTypeEnabled', () => {
  it('returns true when there are no settings at all', () => {
    expect(isNotificationTypeEnabled(undefined, 'reply')).toBe(true);
  });

  it('does not throw on a record that omits enabledNotificationTypes', () => {
    // Pre-fix this threw: `settings.enabledNotificationTypes.includes(...)`.
    expect(() =>
      isNotificationTypeEnabled(mobileMuteRecord(false), 'reply')
    ).not.toThrow();
  });

  it('treats a record missing the array as all-types-enabled', () => {
    expect(isNotificationTypeEnabled(mobileMuteRecord(false), 'reply')).toBe(true);
    expect(isNotificationTypeEnabled(mobileMuteRecord(true), 'mention-you')).toBe(true);
  });

  it('still honours an explicit selection', () => {
    const settings: SpaceNotificationSettings = {
      spaceId: SPACE,
      enabledNotificationTypes: ['mention-you'],
    };
    expect(isNotificationTypeEnabled(settings, 'mention-you')).toBe(true);
    expect(isNotificationTypeEnabled(settings, 'reply')).toBe(false);
  });

  it('still honours an explicitly empty selection (all disabled)', () => {
    const settings: SpaceNotificationSettings = {
      spaceId: SPACE,
      enabledNotificationTypes: [],
    };
    expect(isNotificationTypeEnabled(settings, 'reply')).toBe(false);
  });
});

describe('hasEnabledNotificationTypes', () => {
  it('does not throw on a record that omits enabledNotificationTypes', () => {
    // Pre-fix this threw on `.length`.
    expect(() => hasEnabledNotificationTypes(mobileMuteRecord(false))).not.toThrow();
  });

  it('treats a record missing the array as all-types-enabled', () => {
    expect(hasEnabledNotificationTypes(mobileMuteRecord(false))).toBe(true);
  });

  it('distinguishes an explicitly empty selection from a missing one', () => {
    expect(
      hasEnabledNotificationTypes({ spaceId: SPACE, enabledNotificationTypes: [] })
    ).toBe(false);
  });
});

describe('normalizeSpaceNotificationSettings', () => {
  it('returns full defaults when nothing is stored', () => {
    expect(normalizeSpaceNotificationSettings(SPACE, undefined)).toEqual(
      getDefaultNotificationSettings(SPACE)
    );
    expect(normalizeSpaceNotificationSettings(SPACE, null)).toEqual(
      getDefaultNotificationSettings(SPACE)
    );
  });

  it('fills in the missing array on a mobile-written mute record', () => {
    const out = normalizeSpaceNotificationSettings(SPACE, mobileMuteRecord(false));
    expect(out.enabledNotificationTypes).toEqual(ALL_TYPES);
  });

  it('preserves isMuted while filling the missing array', () => {
    // The load-bearing pair: healing the record must not silently unmute a
    // space the user deliberately muted on their phone.
    expect(
      normalizeSpaceNotificationSettings(SPACE, mobileMuteRecord(true)).isMuted
    ).toBe(true);
    expect(
      normalizeSpaceNotificationSettings(SPACE, mobileMuteRecord(false)).isMuted
    ).toBe(false);
  });

  it('backfills spaceId when the partial record omits it', () => {
    expect(normalizeSpaceNotificationSettings(SPACE, mobileMuteRecord(false)).spaceId).toBe(
      SPACE
    );
  });

  it('never overwrites a stored selection, including an empty one', () => {
    // An empty array is a real user choice ("notify me about nothing"), so it
    // must NOT be mistaken for missing data and reset to all-enabled.
    expect(
      normalizeSpaceNotificationSettings(SPACE, {
        spaceId: SPACE,
        enabledNotificationTypes: [],
      }).enabledNotificationTypes
    ).toEqual([]);

    expect(
      normalizeSpaceNotificationSettings(SPACE, {
        spaceId: SPACE,
        enabledNotificationTypes: ['reply'],
      }).enabledNotificationTypes
    ).toEqual(['reply']);
  });

  it('rejects a non-array value in the array slot', () => {
    // Defends against a corrupted/legacy blob rather than merely an absent key.
    const out = normalizeSpaceNotificationSettings(SPACE, {
      enabledNotificationTypes: 'reply',
    } as unknown as Partial<SpaceNotificationSettings>);
    expect(out.enabledNotificationTypes).toEqual(ALL_TYPES);
  });
});

/**
 * Per-conversation DM setting utilities.
 *
 * Per-conversation overrides (save-edit-history, always-sign, delivery/read
 * receipts) live on `UserConfig.conversationSettings`, keyed by conversationId,
 * and sync across a user's devices via the encrypted config blob. These helpers
 * are the single source of truth for reading, writing, and merging that map so
 * desktop and mobile agree byte-for-byte on the semantics.
 *
 * Merge model: per-entry last-write-wins keyed by `updatedAt`. A reset-to-global
 * writes an entry with no override fields (just `updatedAt`), which acts as its
 * own tombstone — a newer empty entry beats an older non-empty one.
 */

import type { ConversationSettingOverrides } from '../types/user';

/** The `conversationSettings` map shape (conversationId → overrides). */
export type ConversationSettingsMap = {
  [conversationId: string]: ConversationSettingOverrides;
};

/** The boolean override keys (everything on the entry except `updatedAt`). */
export type ConversationSettingKey = Exclude<
  keyof ConversationSettingOverrides,
  'updatedAt'
>;

/**
 * Read a single per-conversation override. Returns `undefined` when the
 * conversation has no entry or that field is unset — the caller then falls back
 * to the global setting / default (e.g. `?? config.deliveryReceipts ?? false`).
 */
export function getConversationSetting(
  map: ConversationSettingsMap | undefined,
  conversationId: string,
  key: ConversationSettingKey
): boolean | undefined {
  return map?.[conversationId]?.[key];
}

/**
 * Return a NEW map with one conversation's overrides updated from `patch` and its
 * `updatedAt` bumped to `now`. A field set to `undefined` in the patch is cleared
 * (reset-to-global for that field). The entry is always retained — even with no
 * override fields left — so it carries a fresh `updatedAt` and wins last-write-wins
 * merge (propagating the reset). Does not mutate the input.
 */
export function setConversationSetting(
  map: ConversationSettingsMap | undefined,
  conversationId: string,
  patch: Partial<Record<ConversationSettingKey, boolean | undefined>>,
  now: number = Date.now()
): ConversationSettingsMap {
  const next: ConversationSettingsMap = { ...(map ?? {}) };
  const entry: ConversationSettingOverrides = { ...(next[conversationId] ?? {}) };

  for (const key of Object.keys(patch) as ConversationSettingKey[]) {
    const value = patch[key];
    if (value === undefined) {
      delete entry[key];
    } else {
      entry[key] = value;
    }
  }

  entry.updatedAt = now;
  next[conversationId] = entry;
  return next;
}

/**
 * Merge two `conversationSettings` maps, per-conversation last-write-wins by
 * `updatedAt` (missing = 0). On a tie the `local` entry is kept, mirroring the
 * config-level "equal timestamp → prefer local" rule. Returns a NEW map; does
 * not mutate either input.
 */
export function mergeConversationSettings(
  local: ConversationSettingsMap | undefined,
  remote: ConversationSettingsMap | undefined
): ConversationSettingsMap {
  const result: ConversationSettingsMap = { ...(local ?? {}) };

  if (remote) {
    for (const [conversationId, remoteEntry] of Object.entries(remote)) {
      const localEntry = result[conversationId];
      const localTs = localEntry?.updatedAt ?? 0;
      const remoteTs = remoteEntry?.updatedAt ?? 0;
      if (!localEntry || remoteTs > localTs) {
        result[conversationId] = remoteEntry;
      }
    }
  }

  return result;
}

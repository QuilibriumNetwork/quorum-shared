/**
 * Shared edit-history logic for message edits (DM + space), so the send,
 * optimistic-cache, and receive paths across apps can't drift apart.
 *
 * MODEL: `edits[]` retains PRIOR versions, oldest first; the message's live
 * `content.text` is always the CURRENT version. On the FIRST edit the original
 * text is seeded into `edits[]` (keyed by the original nonce/createdDate); each
 * later edit appends the version it replaces. A viewer reconstructs the full
 * timeline as `[...edits, current]` — this never loses the original and never
 * duplicates the current version.
 *
 * - `saveEditHistory` OFF → no prior versions retained (`edits: []`).
 * - RECEIVE replay guard: an edit whose `editNonce` already equals the stored
 *   `lastModifiedHash` is a no-op (`changed: false`) so a duplicate delivery
 *   can't clobber stored history. An empty `editNonce` (legacy senders that
 *   don't stamp one) skips the guard and always applies.
 */

import type { Message } from '../types';

/**
 * How long after sending a message it may still be edited.
 *
 * Kept deliberately short (15 minutes): an edit is for fixing a just-noticed
 * mistake, not silently rewriting history a peer has already read. A short
 * window also avoids the awkward interaction between long edit windows and
 * unreliable cross-device delivery (an edit arriving long after the original).
 */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

type EditEntry = NonNullable<Message['edits']>[number];

/** The parts of a message `applyEdit` reads to compute the next edit state. */
export interface EditableMessageState {
  /** Current (pre-edit) text — becomes a prior version once replaced. */
  text: string | string[];
  createdDate: number;
  modifiedDate: number;
  /** Original message nonce; keys the seeded original entry. */
  nonce: string;
  /** Nonce of the last applied edit, if any (drives the replay guard). */
  lastModifiedHash?: string;
  /** Prior versions already retained, oldest first. */
  edits?: Message['edits'];
}

/** Result of applying an edit; the caller sets `content.text` to the new text. */
export interface AppliedEdit {
  /** When false, the edit was already applied — leave the message untouched. */
  changed: boolean;
  /** New `modifiedDate` for the message (the edit timestamp). */
  modifiedDate: number;
  /** New `lastModifiedHash` for the message (the edit nonce). */
  lastModifiedHash: string;
  /** Prior versions after this edit, oldest first. */
  edits: EditEntry[];
}

/**
 * Compute how an edit mutates a message's edit metadata. Used identically on
 * the SEND / optimistic path and the RECEIVE path (single source of truth): the
 * replay guard is inert on send (a fresh nonce never matches the stored one)
 * and active on receive (a re-delivered edit is skipped).
 *
 * The returned `edits` holds the PRIOR versions; the caller is responsible for
 * setting the message's `content.text` to the new text and applying
 * `modifiedDate` / `lastModifiedHash` when `changed` is true.
 */
export function applyEdit(
  current: EditableMessageState,
  params: { editedAt: number; editNonce?: string; saveEditHistory: boolean },
): AppliedEdit {
  const { editedAt, editNonce, saveEditHistory } = params;
  const existingEdits = current.edits ?? [];

  // Replay guard: this exact edit already applied → no-op (don't touch history).
  if (editNonce && current.lastModifiedHash === editNonce) {
    return {
      changed: false,
      modifiedDate: current.modifiedDate,
      lastModifiedHash: current.lastModifiedHash ?? '',
      edits: existingEdits,
    };
  }

  let edits: EditEntry[];
  if (!saveEditHistory) {
    // History off: retain nothing.
    edits = [];
  } else if (current.modifiedDate === current.createdDate) {
    // First edit: seed the original version (current text is still the original).
    edits = [
      {
        text: current.text,
        modifiedDate: current.createdDate,
        lastModifiedHash: current.nonce,
      },
    ];
  } else if (existingEdits.length > 0) {
    // Subsequent edit: append the version being replaced.
    edits = [
      ...existingEdits,
      {
        text: current.text,
        modifiedDate: current.modifiedDate,
        lastModifiedHash: current.lastModifiedHash || current.nonce,
      },
    ];
  } else {
    // Edited before but no retained history (e.g. saveEditHistory turned on
    // after an earlier edit): nothing prior to seed, keep as-is.
    edits = existingEdits;
  }

  return {
    changed: true,
    modifiedDate: editedAt,
    lastModifiedHash: editNonce ?? '',
    edits,
  };
}

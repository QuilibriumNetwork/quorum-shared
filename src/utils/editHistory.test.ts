import { describe, it, expect } from 'vitest';
import {
  MESSAGE_EDIT_WINDOW_MS,
  applyEdit,
  type EditableMessageState,
} from './editHistory';

describe('MESSAGE_EDIT_WINDOW_MS', () => {
  it('is 15 minutes', () => {
    expect(MESSAGE_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('applyEdit', () => {
  // A freshly-posted, never-edited message (modifiedDate === createdDate).
  const original: EditableMessageState = {
    text: 'original',
    createdDate: 100,
    modifiedDate: 100,
    nonce: 'nonce-0',
    lastModifiedHash: '',
    edits: [],
  };

  it('seeds the ORIGINAL version on the first edit (history on)', () => {
    const result = applyEdit(original, {
      editedAt: 200,
      editNonce: 'nonce-1',
      saveEditHistory: true,
    });
    expect(result.changed).toBe(true);
    expect(result.modifiedDate).toBe(200);
    expect(result.lastModifiedHash).toBe('nonce-1');
    // edits retains the ORIGINAL text, keyed by the original nonce/createdDate.
    expect(result.edits).toEqual([
      { text: 'original', modifiedDate: 100, lastModifiedHash: 'nonce-0' },
    ]);
  });

  it('appends the version being replaced on subsequent edits', () => {
    // Message already edited once: content is now 'v2', edits holds the original.
    const edited: EditableMessageState = {
      text: 'v2',
      createdDate: 100,
      modifiedDate: 200,
      nonce: 'nonce-0',
      lastModifiedHash: 'nonce-1',
      edits: [{ text: 'original', modifiedDate: 100, lastModifiedHash: 'nonce-0' }],
    };
    const result = applyEdit(edited, {
      editedAt: 300,
      editNonce: 'nonce-2',
      saveEditHistory: true,
    });
    expect(result.changed).toBe(true);
    expect(result.edits).toEqual([
      { text: 'original', modifiedDate: 100, lastModifiedHash: 'nonce-0' },
      { text: 'v2', modifiedDate: 200, lastModifiedHash: 'nonce-1' },
    ]);
  });

  it('full timeline [...edits, current] preserves original + current with no duplication', () => {
    // Simulate original -> v2 -> v3, threading each result back in.
    let msg: EditableMessageState = { ...original };
    const first = applyEdit(msg, { editedAt: 200, editNonce: 'nonce-1', saveEditHistory: true });
    msg = { text: 'v2', createdDate: 100, modifiedDate: first.modifiedDate, nonce: 'nonce-0', lastModifiedHash: first.lastModifiedHash, edits: first.edits };
    const second = applyEdit(msg, { editedAt: 300, editNonce: 'nonce-2', saveEditHistory: true });
    // current content after second edit would be 'v3'
    const timeline = [...second.edits, { text: 'v3', modifiedDate: second.modifiedDate, lastModifiedHash: second.lastModifiedHash }];
    expect(timeline.map((t) => t.text)).toEqual(['original', 'v2', 'v3']);
  });

  it('retains nothing when history is off', () => {
    const result = applyEdit(original, {
      editedAt: 200,
      editNonce: 'nonce-1',
      saveEditHistory: false,
    });
    expect(result.changed).toBe(true);
    expect(result.edits).toEqual([]);
  });

  it('is a no-op on replay: same nonce already applied → changed:false, history untouched', () => {
    const existing = [{ text: 'original', modifiedDate: 100, lastModifiedHash: 'nonce-0' }];
    const edited: EditableMessageState = {
      text: 'v2',
      createdDate: 100,
      modifiedDate: 200,
      nonce: 'nonce-0',
      lastModifiedHash: 'nonce-1',
      edits: existing,
    };
    const result = applyEdit(edited, {
      editedAt: 999,
      editNonce: 'nonce-1', // same as lastModifiedHash → replay
      saveEditHistory: true,
    });
    expect(result.changed).toBe(false);
    expect(result.modifiedDate).toBe(200); // stored value, not the replayed editedAt
    expect(result.edits).toBe(existing); // unchanged reference — no clobber
  });

  it('always applies when editNonce is empty (legacy senders, no replay guard)', () => {
    const result = applyEdit(original, {
      editedAt: 400,
      editNonce: '',
      saveEditHistory: true,
    });
    expect(result.changed).toBe(true);
    expect(result.lastModifiedHash).toBe('');
    // First edit still seeds the original.
    expect(result.edits).toEqual([
      { text: 'original', modifiedDate: 100, lastModifiedHash: 'nonce-0' },
    ]);
  });

  it('edge: edited before but no retained history → keeps empty (nothing to seed)', () => {
    const edited: EditableMessageState = {
      text: 'v2',
      createdDate: 100,
      modifiedDate: 200, // already edited (modified !== created)
      nonce: 'nonce-0',
      lastModifiedHash: 'nonce-1',
      edits: [], // but no retained history
    };
    const result = applyEdit(edited, {
      editedAt: 300,
      editNonce: 'nonce-2',
      saveEditHistory: true,
    });
    expect(result.changed).toBe(true);
    expect(result.edits).toEqual([]);
  });
});

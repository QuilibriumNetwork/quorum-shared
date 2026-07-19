import { describe, it, expect } from 'vitest';
import {
  MESSAGE_EDIT_WINDOW_MS,
  buildLocalEdits,
  applyReceivedEdit,
} from './editHistory';

describe('MESSAGE_EDIT_WINDOW_MS', () => {
  it('is 15 minutes', () => {
    expect(MESSAGE_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('buildLocalEdits', () => {
  it('returns [] when history is off (drops prior versions)', () => {
    const prior = [{ text: 'old', modifiedDate: 1, lastModifiedHash: '' }];
    expect(buildLocalEdits(prior, 'new', 2, false)).toEqual([]);
  });

  it('appends the new version when history is on', () => {
    const prior = [{ text: 'v1', modifiedDate: 1, lastModifiedHash: '' }];
    const result = buildLocalEdits(prior, 'v2', 2, true);
    expect(result).toEqual([
      { text: 'v1', modifiedDate: 1, lastModifiedHash: '' },
      { text: 'v2', modifiedDate: 2, lastModifiedHash: '' },
    ]);
  });

  it('handles undefined existing edits', () => {
    expect(buildLocalEdits(undefined, 'first', 5, true)).toEqual([
      { text: 'first', modifiedDate: 5, lastModifiedHash: '' },
    ]);
  });
});

describe('applyReceivedEdit', () => {
  it('applies a new edit and records the nonce as lastModifiedHash', () => {
    const result = applyReceivedEdit(
      { edits: [], lastModifiedHash: '' },
      { newText: 'edited', editedAt: 100, editNonce: 'nonce-1', saveEditHistory: false },
    );
    expect(result.changed).toBe(true);
    expect(result.modifiedDate).toBe(100);
    expect(result.lastModifiedHash).toBe('nonce-1');
    expect(result.edits).toEqual([]);
  });

  it('appends to history when saveEditHistory is on', () => {
    const result = applyReceivedEdit(
      { edits: [{ text: 'v1', modifiedDate: 1, lastModifiedHash: '' }], lastModifiedHash: '' },
      { newText: 'v2', editedAt: 200, editNonce: 'nonce-2', saveEditHistory: true },
    );
    expect(result.changed).toBe(true);
    expect(result.edits).toEqual([
      { text: 'v1', modifiedDate: 1, lastModifiedHash: '' },
      { text: 'v2', modifiedDate: 200, lastModifiedHash: 'nonce-2' },
    ]);
  });

  it('is a no-op on replay: same nonce already applied → changed:false, history untouched', () => {
    const existing = [{ text: 'v1', modifiedDate: 1, lastModifiedHash: 'nonce-x' }];
    const result = applyReceivedEdit(
      { edits: existing, lastModifiedHash: 'nonce-x' },
      { newText: 'v1', editedAt: 300, editNonce: 'nonce-x', saveEditHistory: true },
    );
    expect(result.changed).toBe(false);
    expect(result.edits).toBe(existing); // unchanged reference — no clobber
  });

  it('always applies when editNonce is empty (legacy senders, no replay guard)', () => {
    const result = applyReceivedEdit(
      { edits: [], lastModifiedHash: '' },
      { newText: 'edited', editedAt: 400, editNonce: '', saveEditHistory: false },
    );
    expect(result.changed).toBe(true);
    expect(result.lastModifiedHash).toBe('');
  });
});

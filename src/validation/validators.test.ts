import { describe, it, expect } from 'vitest';
import {
  validateSpaceName,
  validateSpaceDescription,
  validateDisplayName,
  validateChannelName,
  validateChannelTopic,
  validateGroupName,
  validateDeviceName,
  validateUserBio,
  validateUserNote,
  MAX_BIO_BYTES,
  MAX_DISPLAY_NAME_BYTES,
  MAX_USER_NOTE_LENGTH,
  isValidField,
} from './index';
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, MAX_TOPIC_LENGTH } from '../utils/validation';

describe('validateSpaceName', () => {
  it('accepts valid names', () => {
    expect(validateSpaceName('Cosmic Vibes')).toEqual({ ok: true });
  });

  it('rejects empty', () => {
    expect(validateSpaceName('')).toEqual({ ok: false, errorKey: 'spaceName.required' });
    expect(validateSpaceName('   ')).toEqual({ ok: false, errorKey: 'spaceName.required' });
  });

  it('rejects too short', () => {
    const result = validateSpaceName('a');
    expect(result).toEqual({
      ok: false,
      errorKey: 'spaceName.tooShort',
      errorVars: { min: MIN_NAME_LENGTH },
    });
  });

  it('rejects too long', () => {
    const long = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateSpaceName(long)).toEqual({
      ok: false,
      errorKey: 'spaceName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    });
  });

  it('rejects HTML injection', () => {
    expect(validateSpaceName('<script>x</script>')).toEqual({
      ok: false,
      errorKey: 'spaceName.invalidChars',
    });
  });

  it('accepts safe special chars', () => {
    expect(validateSpaceName('<3 home').ok).toBe(true);
    expect(validateSpaceName(">_<;").ok).toBe(true);
  });
});

describe('validateSpaceDescription', () => {
  it('accepts valid description', () => {
    expect(validateSpaceDescription('A nice place', 100)).toEqual([]);
  });

  it('returns multiple errors when multiple checks fail', () => {
    const errors = validateSpaceDescription('<script>x</script>' + 'a'.repeat(200), 50);
    expect(errors.length).toBe(2);
    expect(errors.some((e) => !e.ok && e.errorKey === 'spaceDescription.invalidChars')).toBe(true);
    expect(errors.some((e) => !e.ok && e.errorKey === 'spaceDescription.tooLong')).toBe(true);
  });
});

describe('validateDisplayName', () => {
  it('accepts valid names', () => {
    expect(validateDisplayName('Jane Doe')).toEqual({ ok: true });
  });

  it('rejects empty', () => {
    expect(validateDisplayName('')).toEqual({ ok: false, errorKey: 'displayName.required' });
  });

  it('accepts single-character names (no MIN on display names — matches mobile + pre-refactor desktop)', () => {
    // Note: "a" gets caught as impersonation? no — "a" is too short to match any reserved pattern
    expect(validateDisplayName('a')).toEqual({ ok: true });
  });

  it('rejects too long (over the byte budget)', () => {
    const long = 'a'.repeat(MAX_DISPLAY_NAME_BYTES + 1);
    expect(validateDisplayName(long)).toEqual({
      ok: false,
      errorKey: 'displayName.tooLong',
    });
  });

  it('accepts a name exactly at the byte budget', () => {
    const exact = 'a'.repeat(MAX_DISPLAY_NAME_BYTES);
    expect(validateDisplayName(exact)).toEqual({ ok: true });
  });

  it('counts bytes, not characters: a multi-byte name shorter than the budget in chars can still be too long', () => {
    // Each "😀" is 4 UTF-8 bytes. 9 of them = 36 bytes > 32, but only 18 UTF-16
    // code units / 9 visible chars — a character-based check would wrongly pass.
    const emoji = '😀'.repeat(9);
    expect(emoji.length).toBeLessThan(MAX_DISPLAY_NAME_BYTES);
    expect(validateDisplayName(emoji)).toEqual({
      ok: false,
      errorKey: 'displayName.tooLong',
    });
  });

  it('rejects mention-reserved names', () => {
    expect(validateDisplayName('everyone')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedMention',
    });
  });

  it('rejects impersonation names (including homoglyphs)', () => {
    expect(validateDisplayName('admin')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedImpersonation',
    });
    expect(validateDisplayName('@dmin')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedImpersonation',
    });
  });

  it('rejects HTML injection', () => {
    expect(validateDisplayName('<script>x</script>')).toEqual({
      ok: false,
      errorKey: 'displayName.invalidChars',
    });
  });

  it('rejects names ending in .q (reserved for verified QNS names)', () => {
    expect(validateDisplayName('alice.q')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedQnsSuffix',
    });
  });

  it('allows a mid-name dot (only ".q" endings are reserved)', () => {
    expect(validateDisplayName('jane.doe')).toEqual({ ok: true });
  });

  it('rejects lookalike/full-width dot bypasses on the .q suffix', () => {
    expect(validateDisplayName('alice．q')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedQnsSuffix',
    }); // U+FF0E fullwidth dot
    expect(validateDisplayName('alice﹒q')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedQnsSuffix',
    }); // U+FE52 small full stop
  });

  it('rejects trailing-space bypass on a .q suffix', () => {
    expect(validateDisplayName('alice.q ')).toEqual({
      ok: false,
      errorKey: 'displayName.reservedQnsSuffix',
    });
  });

  it('still accepts ordinary names without dots', () => {
    expect(validateDisplayName('Alice A')).toEqual({ ok: true });
  });
});

describe('validateChannelName', () => {
  it('accepts valid names', () => {
    expect(validateChannelName('general')).toEqual({ ok: true });
  });

  it('accepts single-character names (no MIN check)', () => {
    expect(validateChannelName('a')).toEqual({ ok: true });
  });

  it('rejects empty', () => {
    expect(validateChannelName('')).toEqual({ ok: false, errorKey: 'channelName.required' });
  });

  it('rejects too long', () => {
    const long = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateChannelName(long)).toEqual({
      ok: false,
      errorKey: 'channelName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    });
  });

  it('rejects HTML injection', () => {
    expect(validateChannelName('<script>')).toEqual({
      ok: false,
      errorKey: 'channelName.invalidChars',
    });
  });
});

describe('validateChannelTopic', () => {
  it('accepts empty topic', () => {
    expect(validateChannelTopic('')).toEqual({ ok: true });
  });

  it('accepts valid topic', () => {
    expect(validateChannelTopic('General discussion')).toEqual({ ok: true });
  });

  it('rejects too long', () => {
    const long = 'a'.repeat(MAX_TOPIC_LENGTH + 1);
    expect(validateChannelTopic(long)).toEqual({
      ok: false,
      errorKey: 'channelTopic.tooLong',
      errorVars: { max: MAX_TOPIC_LENGTH },
    });
  });

  it('rejects HTML injection (non-empty only)', () => {
    expect(validateChannelTopic('<script>')).toEqual({
      ok: false,
      errorKey: 'channelTopic.invalidChars',
    });
  });
});

describe('validateGroupName', () => {
  it('accepts valid names', () => {
    expect(validateGroupName('General')).toEqual({ ok: true });
  });

  it('rejects empty', () => {
    expect(validateGroupName('   ')).toEqual({ ok: false, errorKey: 'groupName.required' });
  });

  it('rejects too long', () => {
    const long = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateGroupName(long)).toEqual({
      ok: false,
      errorKey: 'groupName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    });
  });
});

describe('validateDeviceName', () => {
  it('accepts valid names', () => {
    expect(validateDeviceName("Jane's iPhone")).toEqual({ ok: true });
    expect(validateDeviceName('Laptop (work)')).toEqual({ ok: true });
    expect(validateDeviceName('MacBook-Pro')).toEqual({ ok: true });
  });

  it('rejects empty', () => {
    expect(validateDeviceName('')).toEqual({ ok: false, errorKey: 'deviceName.required' });
  });

  it('rejects disallowed punctuation', () => {
    const r1 = validateDeviceName('phone@home');
    const r2 = validateDeviceName('phone!');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r1.ok) expect(r1.errorKey).toBe('deviceName.invalidCharset');
    if (!r2.ok) expect(r2.errorKey).toBe('deviceName.invalidCharset');
  });

  it('rejects HTML injection', () => {
    // XSS check fires before charset check
    expect(validateDeviceName('<script>')).toEqual({
      ok: false,
      errorKey: 'deviceName.invalidChars',
    });
  });

  it('accepts unicode letters', () => {
    expect(validateDeviceName('Téléphone')).toEqual({ ok: true });
    expect(validateDeviceName('携帯電話')).toEqual({ ok: true });
  });
});

describe('validateUserBio', () => {
  it('accepts valid bio', () => {
    expect(validateUserBio('Hello world')).toEqual([]);
  });

  it('rejects too long (over the byte budget)', () => {
    const errors = validateUserBio('a'.repeat(MAX_BIO_BYTES + 1));
    expect(errors).toEqual([{ ok: false, errorKey: 'userBio.tooLong' }]);
  });

  it('accepts a bio exactly at the byte budget', () => {
    expect(validateUserBio('a'.repeat(MAX_BIO_BYTES))).toEqual([]);
  });

  it('counts bytes, not characters: a multi-byte bio shorter than the budget in chars can still be too long', () => {
    // Each "😀" is 4 UTF-8 bytes. 65 of them = 260 bytes > 256, but only 130
    // UTF-16 code units — a character-based check would wrongly pass.
    const emoji = '😀'.repeat(65);
    expect(emoji.length).toBeLessThan(MAX_BIO_BYTES);
    expect(validateUserBio(emoji)).toEqual([{ ok: false, errorKey: 'userBio.tooLong' }]);
  });

  it('rejects HTML injection', () => {
    const errors = validateUserBio('<script>');
    expect(errors[0]).toEqual({ ok: false, errorKey: 'userBio.invalidChars' });
  });
});

describe('validateUserNote', () => {
  it('accepts valid note', () => {
    expect(validateUserNote('Some private thought')).toEqual([]);
  });

  it('rejects script injection patterns', () => {
    const errors = validateUserNote('<script>alert(1)</script>');
    expect(errors[0]).toEqual({ ok: false, errorKey: 'userNote.invalidContent' });
  });

  it('rejects javascript: pseudo-protocol', () => {
    const errors = validateUserNote('Click javascript:alert(1)');
    expect(errors[0]).toEqual({ ok: false, errorKey: 'userNote.invalidContent' });
  });

  it('rejects too long', () => {
    const errors = validateUserNote('a'.repeat(MAX_USER_NOTE_LENGTH + 1));
    expect(errors[0]).toEqual({
      ok: false,
      errorKey: 'userNote.tooLong',
      errorVars: { max: MAX_USER_NOTE_LENGTH },
    });
  });

  it('accepts angle brackets in safe contexts (notes are not HTML-rendered)', () => {
    // Notes are private; only script-injection patterns are blocked, not all `<`
    expect(validateUserNote('a > b is true')).toEqual([]);
  });
});

describe('isValidField helper', () => {
  it('narrows type correctly', () => {
    const r = validateSpaceName('Valid Name');
    if (isValidField(r)) {
      // typescript should narrow r to FieldValidationOk here
      expect(r.ok).toBe(true);
    }
  });

  it('returns false for errors', () => {
    expect(isValidField(validateSpaceName(''))).toBe(false);
  });
});

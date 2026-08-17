import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

// A stand-in for real decrypted message content. Never use a real address or a
// real message as fixture data.
const CANARY = 'CANARY-b7f3e9a1-TOP-SECRET-MESSAGE-BODY';

/**
 * Reproduces the exact failure shape this redaction exists for.
 *
 * `DoubleRatchetInboxDecrypt` runs `JSON.parse()` on ALREADY-DECRYPTED content
 * (quilibrium-js-sdk-channels, `src/channel/channel.ts`). When that plaintext is
 * not valid JSON, V8 echoes its first 10 characters into the SyntaxError
 * message, and callers forward the error object to logger.error.
 */
const errorFromParsingDecryptedContent = (plaintext: string): Error => {
  try {
    JSON.parse(plaintext);
    throw new Error('fixture is wrong: JSON.parse was expected to throw');
  } catch (e) {
    return e as Error;
  }
};

describe('logger redaction', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  // JSON.stringify renders an Error as {} because its properties are not
  // enumerable. Without this replacer every "does not contain the canary"
  // assertion below would pass vacuously, whether redaction worked or not.
  // The "redact off" control arm exists to catch exactly that, and did.
  const logged = () =>
    JSON.stringify(spy.mock.calls, (_k, v) =>
      v instanceof Error ? { name: v.name, message: v.message } : v
    );

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.configure({ enabled: true, minLevel: 'debug', redact: false });
  });

  afterEach(() => {
    spy.mockRestore();
    logger.configure({ enabled: true, minLevel: 'log', redact: false });
  });

  it('CONTROL: the raw error really does leak plaintext', () => {
    // If this fails, V8 changed its message format and every assertion below is
    // passing vacuously. This arm must stay red-capable.
    const raw = errorFromParsingDecryptedContent(CANARY);
    expect(raw.message).toContain(CANARY.slice(0, 10));
  });

  it('CONTROL: with redact off, the error passes through untouched', () => {
    // Proves redaction is genuinely opt-in, so local development is unaffected.
    logger.error('boom', errorFromParsingDecryptedContent(CANARY));
    expect(logged()).toContain(CANARY.slice(0, 10));
  });

  it('strips echoed plaintext from a directly-passed error', () => {
    logger.configure({ redact: true });
    logger.error('boom', errorFromParsingDecryptedContent(CANARY));
    expect(logged()).not.toContain(CANARY.slice(0, 10));
  });

  it('strips echoed plaintext from an error nested in a context object', () => {
    // logger.warn('msg', { err, spaceId }) is the other common call shape.
    logger.configure({ redact: true });
    logger.error('boom', {
      err: errorFromParsingDecryptedContent(CANARY),
      spaceId: 'space-123',
    });
    const out = logged();
    expect(out).not.toContain(CANARY.slice(0, 10));
    expect(out).toContain('space-123'); // surrounding context is preserved
  });

  it('leaks nothing regardless of what the plaintext starts with', () => {
    logger.configure({ redact: true });
    const openings = [
      'Hey, meet me at',
      '{not quite json',
      '[1,2,3 unterminated',
      'null and then some',
    ];
    for (const opening of openings) {
      spy.mockClear();
      logger.error('boom', errorFromParsingDecryptedContent(`${opening} ${CANARY}`));
      const out = logged();
      expect(out).not.toContain(CANARY.slice(0, 10));
      expect(out).not.toContain(opening.slice(0, 10));
    }
  });

  it('CONTROL: preserves diagnostic value — an opaque crypto error survives intact', () => {
    // Redaction that also destroyed the useful signal would defeat the point.
    // `aead::Error` is RustCrypto's opaque type and carries no data.
    logger.configure({ redact: true });
    logger.error('boom', new Error('Decryption failed: aead::Error'));
    const out = logged();
    expect(out).toContain('Decryption failed: aead::Error');
    expect(out).toContain('Error');
  });

  it('does not mangle ordinary log arguments', () => {
    logger.configure({ redact: true });
    logger.error('[Module] something failed', 'a plain string', 42, {
      spaceId: 'abc',
      nested: { keep: 'me' },
    });
    const out = logged();
    expect(out).toContain('[Module] something failed');
    expect(out).toContain('a plain string');
    expect(out).toContain('42');
    expect(out).toContain('abc');
  });

  it('does not walk class instances, whose getters may have side effects', () => {
    logger.configure({ redact: true });
    let touched = false;
    class Risky {
      get trap() {
        touched = true;
        return 'boom';
      }
    }
    logger.error('boom', new Risky());
    expect(touched).toBe(false);
  });
});

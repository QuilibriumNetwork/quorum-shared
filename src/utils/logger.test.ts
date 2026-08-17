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

  it('strips echoed plaintext from an error inside an array inside an object', () => {
    // Ordinary call shape: logger.error(msg, { errors: [...] }). The first
    // version of redactErrors stopped walking at depth 1, so the container was
    // returned untouched and the Error inside it was never reached.
    logger.configure({ redact: true });
    logger.error('boom', { errors: [errorFromParsingDecryptedContent(CANARY)] });
    expect(logged()).not.toContain(CANARY.slice(0, 10));
  });

  it('strips echoed plaintext from an error two objects deep', () => {
    logger.configure({ redact: true });
    logger.error('boom', {
      outer: { err: errorFromParsingDecryptedContent(CANARY) },
    });
    expect(logged()).not.toContain(CANARY.slice(0, 10));
  });

  it('redacts an error-like object that fails `instanceof Error`', () => {
    // Cross-realm errors (iframe/worker) and DOMException do not satisfy
    // instanceof Error, and a WASM-backed SDK can throw any shape it likes.
    // Duck-typing on a string `message` catches those.
    logger.configure({ redact: true });
    const raw = errorFromParsingDecryptedContent(CANARY);
    logger.error('boom', { name: raw.name, message: raw.message });
    expect(logged()).not.toContain(CANARY.slice(0, 10));
  });

  it('survives a cyclic object without hanging or throwing', () => {
    logger.configure({ redact: true });
    const cyclic: Record<string, unknown> = { err: errorFromParsingDecryptedContent(CANARY) };
    cyclic.self = cyclic;
    expect(() => logger.error('boom', cyclic)).not.toThrow();
    expect(logged()).not.toContain(CANARY.slice(0, 10));
  });

  it('does not leak plaintext that itself contains a quote character', () => {
    // THE case the first redaction missed. V8 wraps its echoed excerpt in
    // double quotes; if the plaintext contains a quote inside that window, a
    // lazy /"[^"]*"/ pairs the delimiters wrongly and the text BETWEEN the
    // wrong pair survives:
    //   raw       Unexpected token 'H', "He "LEAKME"... is not valid JSON
    //   old redact  ... <redacted>LEAKME<redacted> ...
    // Dialogue, nicknames and scare-quotes are ordinary in real messages.
    logger.configure({ redact: true });
    logger.error('boom', errorFromParsingDecryptedContent('He "LEAKME" and more'));
    expect(logged()).not.toContain('LEAKME');
  });

  it('does not leak on an odd number of quotes in the echoed window', () => {
    logger.configure({ redact: true });
    logger.error('boom', errorFromParsingDecryptedContent('a "ODDQUOTE and more'));
    expect(logged()).not.toContain('ODDQUOTE');
  });

  it('CONTROL: keeps single-quoted identifiers, which are code constants not data', () => {
    // DOMExceptions from IndexedDB quote the method/store name, and that name
    // IS the diagnostic. Redacting it would recreate the zero-signal problem
    // this whole effort exists to fix.
    logger.configure({ redact: true });
    logger.error(
      'boom',
      new Error("Failed to execute 'put' on 'IDBObjectStore': The transaction has finished.")
    );
    const out = logged();
    expect(out).toContain('put');
    expect(out).toContain('IDBObjectStore');
  });

  it('keeps a redacted stack, which is the most useful part of a report', () => {
    logger.configure({ redact: true });
    logger.error('boom', errorFromParsingDecryptedContent(CANARY));
    const out = logged();
    expect(out).toContain('stack');
    expect(out).not.toContain(CANARY.slice(0, 10));
  });

  it('never throws into the caller, even on a getter that throws', () => {
    // A logger that throws can abort the catch block that called it, which is
    // strictly worse than one that stays silent.
    logger.configure({ redact: true });
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, 'boom', {
      enumerable: true,
      get() {
        throw new Error('getter exploded');
      },
    });
    expect(() => logger.error('boom', hostile)).not.toThrow();
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

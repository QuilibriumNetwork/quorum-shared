/**
 * Logger utility that respects build environment
 *
 * In development: logs to console
 * In production: no-ops for performance
 *
 * Usage:
 *   import { logger } from '@quorum/shared';
 *   logger.log('[MyModule]', 'some message', data);
 *   logger.warn('[MyModule]', 'warning message');
 *   logger.error('[MyModule]', 'error message', error);
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  /**
   * Strip data that JS engines echo into Error messages before it reaches the
   * console. OFF by default so local development keeps full-fidelity errors;
   * any route that makes logs visible in a PRODUCTION build must turn it on.
   * See `redactErrors` below for what this protects against.
   */
  redact: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  log: 1,
  info: 2,
  warn: 3,
  error: 4,
};

// Default config - can be overridden by calling logger.configure()
let config: LoggerConfig = {
  enabled: true, // Will be set based on environment
  minLevel: 'log',
  redact: false, // dev keeps full errors; production routes opt in
};

// Detect environment
function detectEnvironment(): boolean {
  // React Native / Expo
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }
  // Node.js / Electron
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }
  // Browser
  if (typeof window !== 'undefined') {
    return window.location?.hostname === 'localhost';
  }
  // Default to enabled
  return true;
}

// Initialize based on environment
config.enabled = detectEnvironment();

// No-op function for production
const noop = (): void => {};

function shouldLog(level: LogLevel): boolean {
  if (!config.enabled) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
}

/**
 * Spans a JS engine may have filled with echoed input.
 *
 * WHY: `DoubleRatchetInboxDecrypt` runs `JSON.parse()` on already-DECRYPTED
 * content (quilibrium-js-sdk-channels, `src/channel/channel.ts`). When a
 * decrypted payload is not valid JSON, V8 echoes its first 10 characters into
 * the SyntaxError message:
 *
 *   JSON.parse("Hey, meet me at midnight")
 *   -> SyntaxError: Unexpected token 'H', "Hey, meet "... is not valid JSON
 *
 * Callers forward such errors to logger.error, so an unredacted line carries
 * the opening of somebody's message. Quoting is how engines conventionally
 * delimit echoed input, so removing quoted spans kills the echo while leaving
 * the diagnostic remainder ("is not valid JSON", "Decryption failed:
 * aead::Error") intact. The crypto layer itself is clean — a genuine AEAD
 * failure carries no data.
 *
 * ⚠️ The 10-character echo is V8 behaviour. Hermes/JSC format parse errors
 * differently, so the React Native side needs its own measured control arm
 * before this is trusted there.
 */
/**
 * The echoed excerpt itself. GREEDY and double-quote only, both deliberately.
 *
 * ⚠️ This was `/"[^"]*"|'[^']*'/g` and that version LEAKED. Two independent
 * failures, both reproduced:
 *
 *  1. Lazy matching pairs delimiters wrongly when the plaintext contains its
 *     own quote, and the text between the wrong pair survives:
 *       plaintext  He "LEAKME" and more
 *       raw        Unexpected token 'H', "He "LEAKME"... is not valid JSON
 *       old redact Unexpected token 'H', <redacted>LEAKME<redacted>...
 *     Dialogue, nicknames and scare-quotes are ordinary in real messages, so
 *     this was not an edge case. Greedy — first quote to last — cannot be
 *     split this way.
 *
 *  2. The single-quote half treated every apostrophe as a delimiter, so an
 *     ordinary contraction paired with an unrelated quoted identifier and ate
 *     the text between them:
 *       Something you don't expect: value 'foo' was received
 *    -> Something you don<redacted>foo' was received
 *     It also protected nothing: V8 puts the echoed payload in DOUBLE quotes.
 */
const ECHOED_EXCERPT = /"[\s\S]*"/;

/**
 * V8 also names the offending character, `Unexpected token 'H'` — one character
 * of plaintext. Matching exactly one character between the quotes redacts that
 * without touching identifiers like `'put'` or `'IDBObjectStore'`, which are
 * code constants and are frequently the ENTIRE diagnostic value of a
 * DOMException. Redacting those would recreate the zero-signal problem this
 * work exists to fix.
 */
const ECHOED_TOKEN_CHAR = /'.'/g;

const redactMessage = (message: string): string =>
  message
    .replace(ECHOED_EXCERPT, '<redacted>')
    .replace(ECHOED_TOKEN_CHAR, "'<redacted>'");

/**
 * True for anything carrying a string `message`, whether or not it is a real
 * `Error`.
 *
 * `instanceof Error` is not sufficient and relying on it leaked. It is false
 * for cross-realm errors (thrown in an iframe or worker), false for
 * `DOMException` in most engines, and false for whatever shape a WASM-backed
 * SDK decides to throw — and the decrypt path this protects runs through
 * exactly such an SDK. Duck-typing on `message` catches all of them.
 */
const isErrorLike = (v: unknown): v is { name?: unknown; message: string } =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { message?: unknown }).message === 'string';

/**
 * Deep enough for realistic log shapes (`{ ctx: { errors: [err] } }`) without
 * walking unbounded graphs on every call. Anything deeper is replaced rather
 * than passed through: this is a privacy control, so the unknown case fails
 * closed.
 */
const MAX_DEPTH = 4;

/**
 * Errors reach the logger in many shapes: directly (`logger.warn(msg, err)`),
 * one level inside a context object (`logger.warn(msg, { err, spaceId })`), and
 * inside nested containers (`{ errors: [err] }`).
 *
 * An earlier version stopped at depth 1 and, worse, bailed out BEFORE walking a
 * container found at that depth — so `{ errors: [err] }` and `{ outer: { err } }`
 * were returned completely untouched and leaked the full plaintext. Both are
 * ordinary call shapes. Regression tests for each are in logger.test.ts.
 */
function redactErrors(
  arg: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (arg === null || typeof arg !== 'object') return arg;

  // Checked before the depth and prototype guards below, so an error nested
  // deeply, or one that is a class instance, is still redacted.
  if (arg instanceof Error || isErrorLike(arg)) {
    const name = (arg as { name?: unknown }).name;
    const stack = (arg as { stack?: unknown }).stack;
    return {
      name: typeof name === 'string' ? name : 'Error',
      message: redactMessage((arg as { message: string }).message),
      // Kept, because dropping it silently removed the single most useful part
      // of an error report. A stack holds function names, file paths and line
      // numbers, not echoed input — but it is redacted anyway, since an engine
      // can embed a stringified argument in a frame.
      ...(typeof stack === 'string' ? { stack: redactMessage(stack) } : {}),
    };
  }

  if (seen.has(arg)) return '<cycle>';
  if (depth >= MAX_DEPTH) return '<truncated>';
  seen.add(arg);

  if (Array.isArray(arg))
    return arg.map((v) => redactErrors(v, depth + 1, seen));

  // Only walk plain objects. Class instances may have getters with side
  // effects, so they are passed through untouched — acceptable because the
  // error-like check above already caught the shape that carries a message.
  const proto: unknown = Object.getPrototypeOf(arg);
  if (proto !== Object.prototype && proto !== null) return arg;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
    out[k] = redactErrors(v, depth + 1, seen);
  }
  return out;
}

function createLogMethod(level: LogLevel): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    if (!shouldLog(level)) return;
    if (!config.redact) {
      console[level](...args);
      return;
    }
    let safe: unknown[];
    try {
      safe = args.map((a) => redactErrors(a));
    } catch {
      // A logger must never throw into its caller. `Object.entries` invokes
      // getters, and an accessor property that throws would otherwise
      // propagate out of logger.error and abort the very catch block that
      // called it — breaking the "fail open and log" design this codebase
      // relies on. Fail closed on content, but never on control flow.
      safe = ['<redaction failed>'];
    }
    console[level](...safe);
  };
}

export const logger = {
  /**
   * Configure the logger
   */
  configure(newConfig: Partial<LoggerConfig>): void {
    config = { ...config, ...newConfig };
  },

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return config.enabled;
  },

  /**
   * Enable logging (useful for debugging production issues)
   */
  enable(): void {
    config.enabled = true;
  },

  /**
   * Disable logging
   */
  disable(): void {
    config.enabled = false;
  },

  /**
   * Log at debug level
   */
  debug: createLogMethod('debug'),

  /**
   * Log at default level
   */
  log: createLogMethod('log'),

  /**
   * Log at info level
   */
  info: createLogMethod('info'),

  /**
   * Log at warn level
   */
  warn: createLogMethod('warn'),

  /**
   * Log at error level (always logs unless explicitly disabled)
   */
  error: createLogMethod('error'),

  /**
   * Create a scoped logger with a prefix
   */
  scope(prefix: string) {
    return {
      debug: (...args: unknown[]) => logger.debug(prefix, ...args),
      log: (...args: unknown[]) => logger.log(prefix, ...args),
      info: (...args: unknown[]) => logger.info(prefix, ...args),
      warn: (...args: unknown[]) => logger.warn(prefix, ...args),
      error: (...args: unknown[]) => logger.error(prefix, ...args),
    };
  },
};

// Type declaration for React Native's __DEV__ global
declare const __DEV__: boolean | undefined;

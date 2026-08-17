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
const QUOTED_SPAN = /"[^"]*"|'[^']*'/g;

const redactError = (e: Error): { name: string; message: string } => ({
  name: e.name,
  message: e.message.replace(QUOTED_SPAN, '<redacted>'),
});

/**
 * Errors are commonly passed either directly (`logger.warn(msg, err)`) or
 * nested one level inside a context object (`logger.warn(msg, { err, spaceId })`).
 * Both shapes are covered; deeper nesting is left alone rather than walking
 * arbitrary graphs on every log call.
 */
function redactErrors(arg: unknown, depth = 0): unknown {
  if (arg instanceof Error) return redactError(arg);
  if (depth >= 1 || arg === null || typeof arg !== 'object') return arg;
  if (Array.isArray(arg)) return arg.map((v) => redactErrors(v, depth + 1));

  // Only walk plain objects. Class instances may have getters with side effects.
  const proto: unknown = Object.getPrototypeOf(arg);
  if (proto !== Object.prototype && proto !== null) return arg;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
    out[k] = redactErrors(v, depth + 1);
  }
  return out;
}

function createLogMethod(level: LogLevel): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    if (shouldLog(level)) {
      console[level](...(config.redact ? args.map((a) => redactErrors(a)) : args));
    }
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

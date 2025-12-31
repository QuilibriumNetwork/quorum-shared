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

function createLogMethod(level: LogLevel): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    if (shouldLog(level)) {
      console[level](...args);
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

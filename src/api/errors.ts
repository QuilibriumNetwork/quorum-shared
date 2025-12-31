/**
 * API error classes
 */

/** API error codes */
export enum ApiErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Auth errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',

  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',

  // Server errors
  SERVER_ERROR = 'SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

/** API error details */
export interface ApiErrorDetails {
  code: ApiErrorCode;
  message: string;
  status?: number;
  field?: string;
  retryAfter?: number;
  originalError?: Error;
}

/**
 * Custom API error class
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly field?: string;
  readonly retryAfter?: number;
  readonly originalError?: Error;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiError';
    this.code = details.code;
    this.status = details.status;
    this.field = details.field;
    this.retryAfter = details.retryAfter;
    this.originalError = details.originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /** Check if error is retryable */
  get isRetryable(): boolean {
    return [
      ApiErrorCode.NETWORK_ERROR,
      ApiErrorCode.TIMEOUT,
      ApiErrorCode.RATE_LIMITED,
      ApiErrorCode.SERVER_ERROR,
      ApiErrorCode.SERVICE_UNAVAILABLE,
    ].includes(this.code);
  }

  /** Check if error requires re-authentication */
  get requiresAuth(): boolean {
    return [
      ApiErrorCode.UNAUTHORIZED,
      ApiErrorCode.TOKEN_EXPIRED,
    ].includes(this.code);
  }

  /** Convert to JSON-serializable object */
  toJSON(): ApiErrorDetails {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      field: this.field,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Create ApiError from HTTP response
 */
export function createApiError(
  status: number,
  message?: string,
  field?: string
): ApiError {
  let code: ApiErrorCode;
  let defaultMessage: string;

  switch (status) {
    case 400:
      code = ApiErrorCode.BAD_REQUEST;
      defaultMessage = 'Invalid request';
      break;
    case 401:
      code = ApiErrorCode.UNAUTHORIZED;
      defaultMessage = 'Authentication required';
      break;
    case 403:
      code = ApiErrorCode.FORBIDDEN;
      defaultMessage = 'Access denied';
      break;
    case 404:
      code = ApiErrorCode.NOT_FOUND;
      defaultMessage = 'Resource not found';
      break;
    case 409:
      code = ApiErrorCode.CONFLICT;
      defaultMessage = 'Resource conflict';
      break;
    case 422:
      code = ApiErrorCode.VALIDATION_ERROR;
      defaultMessage = 'Validation failed';
      break;
    case 429:
      code = ApiErrorCode.RATE_LIMITED;
      defaultMessage = 'Rate limit exceeded';
      break;
    case 500:
      code = ApiErrorCode.SERVER_ERROR;
      defaultMessage = 'Server error';
      break;
    case 503:
      code = ApiErrorCode.SERVICE_UNAVAILABLE;
      defaultMessage = 'Service unavailable';
      break;
    default:
      code = ApiErrorCode.UNKNOWN;
      defaultMessage = 'An unexpected error occurred';
  }

  return new ApiError({
    code,
    message: message || defaultMessage,
    status,
    field,
  });
}

/**
 * Create ApiError from network error
 */
export function createNetworkError(error: Error): ApiError {
  if (error.name === 'AbortError') {
    return new ApiError({
      code: ApiErrorCode.TIMEOUT,
      message: 'Request timed out',
      originalError: error,
    });
  }

  return new ApiError({
    code: ApiErrorCode.NETWORK_ERROR,
    message: 'Network error',
    originalError: error,
  });
}

/**
 * API exports
 */

// Client interface and types
export type {
  QuorumApiClient,
  SendMessageParams,
  SendDirectMessageParams,
  AddReactionParams,
  RemoveReactionParams,
  EditMessageParams,
  DeleteMessageParams,
} from './client';

// Errors
export {
  ApiError,
  ApiErrorCode,
  createApiError,
  createNetworkError,
} from './errors';
export type { ApiErrorDetails } from './errors';

// Endpoints
export {
  endpoints,
} from './endpoints';
export type {
  ApiConfig,
  HttpMethod,
  RequestOptions,
  PaginationParams,
  MessageListParams,
} from './endpoints';

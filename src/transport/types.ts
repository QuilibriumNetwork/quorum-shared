/**
 * Transport types and interfaces
 *
 * Platform-agnostic transport layer for HTTP and IPC communication.
 */

// ============ HTTP Transport ============

export interface TransportConfig {
  baseUrl: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

export interface TransportRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  signal?: AbortSignal;
}

export interface TransportResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * TransportClient - Platform-agnostic HTTP transport
 *
 * Implementations:
 * - Fetch (mobile/web): Uses native fetch API
 * - Electron IPC (desktop): Uses Electron IPC for main process requests
 */
export interface TransportClient {
  /**
   * Make an HTTP request
   */
  request<T>(endpoint: string, options?: TransportRequestOptions): Promise<TransportResponse<T>>;

  /**
   * Configure the transport client
   */
  configure(config: TransportConfig): void;

  /**
   * Set authorization header for all requests
   */
  setAuthToken(token: string): void;

  /**
   * Clear authorization
   */
  clearAuth(): void;
}

// ⚠️ Do NOT add `export * from './transport'` here.
//
// `transport.ts` holds internals — `qnsRequest`, the deadline plumbing, the
// option-normalising helpers — that are deliberately not part of this package's
// public surface. The public names it does own (`QNS_BASE_URL`,
// `QNS_DEFAULT_TIMEOUT_MS`, `QnsRequestOptions`, `QnsRequestInput`) are
// re-exported explicitly from `./resolver`, which is where the boundary is
// documented. `qnsExportSurface.test.ts` fails if that boundary moves.
export * from './resolver';
export * from './resolveBatch';
export * from './deriveAddress';
export * from './verifyQnsClaim';

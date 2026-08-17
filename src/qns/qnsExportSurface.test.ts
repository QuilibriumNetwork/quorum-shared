/**
 * What the QNS module actually exports.
 *
 * The transport internals (`qnsRequest`, the deadline plumbing, the
 * option-normalising helpers) are kept out of the package's public surface on
 * purpose, and until now the only thing enforcing that was a comment. Adding
 * `export * from './transport'` to `index.ts` is a one-line change that looks
 * exactly like the four lines already sitting next to it, produces no error,
 * and quietly turns module-private helpers into API that two shipping apps can
 * start depending on — at which point removing them is a breaking change.
 *
 * This test makes the boundary machine-checked. It is a tripwire, not a
 * specification: if you are deliberately adding a public export, updating the
 * list below is the correct fix and takes ten seconds. If you are seeing it go
 * red without having meant to change the API, that is the point.
 */

import { describe, it, expect } from 'vitest';
import * as qns from './index';

/** Every name this module intends to export. Alphabetical, for diff sanity. */
const PUBLIC_SURFACE = [
  'QNS_BASE_URL',
  'QNS_BATCH_LIMIT',
  'QNS_DEFAULT_TIMEOUT_MS',
  'claimedNameBelongsTo',
  'deriveAddress',
  'resolveName',
  'resolveNamesBatch',
].sort();

describe('the QNS public surface', () => {
  it('exports exactly the intended names', () => {
    expect(Object.keys(qns).sort()).toEqual(PUBLIC_SURFACE);
  });

  it('does not leak the transport internals', () => {
    // Named individually rather than inferred from the list above, so that
    // adding a leak AND updating the list still fails. These are the specific
    // things that must never become API.
    for (const internal of ['qnsRequest', 'startDeadline', 'normalizeRequestOptions']) {
      expect(qns).not.toHaveProperty(internal);
    }
  });
});

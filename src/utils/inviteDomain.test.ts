/**
 * Invite links are generated with one domain, whatever build generates them.
 *
 * This used to depend on `window.location`, which reads as a harmless
 * convenience and is not one. The generated URL is persisted into
 * `space.inviteUrl` and replicated to every member on every client, so a link
 * minted on a staging or localhost build reached real users as a URL they could
 * not open. Mobile's accept-list did not include the staging host at all, so
 * such a link additionally failed its `isPublicInvite` check and hid the
 * member-facing share affordance.
 *
 * The asymmetry these tests pin is the whole design: GENERATION is canonical,
 * ACCEPTANCE stays permissive. Narrowing acceptance to match would reject
 * legacy links that are already in circulation, which is the opposite of the
 * goal.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  getInviteBaseDomain,
  getInviteDisplayDomain,
  getInviteUrlBase,
  getValidInvitePrefixes,
} from './inviteDomain';

const PRODUCTION = 'app.quorummessenger.com';

/**
 * Point `window.location` at a host, the way a build served from it would.
 * jsdom's real `location` is not assignable, so it is replaced wholesale.
 */
function pretendServedFrom(hostname: string, port = '') {
  vi.stubGlobal('window', { location: { hostname, port } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the domain invite links are generated with', () => {
  it.each([
    ['production', PRODUCTION, ''],
    ['staging', 'test.quorummessenger.com', ''],
    ['a dev server', 'localhost', '5173'],
    ['a dev server on another port', '127.0.0.1', '3000'],
    ['some custom deployment', 'quorum.example.org', ''],
  ])('is production even when served from %s', (_label, hostname, port) => {
    pretendServedFrom(hostname, port);
    expect(getInviteBaseDomain()).toBe(PRODUCTION);
  });

  it('is production with no window at all, as in a native client', () => {
    vi.stubGlobal('window', undefined);
    expect(getInviteBaseDomain()).toBe(PRODUCTION);
  });

  it('never emits the short qm.one form, which mobile does not generate', () => {
    // Desktop carried a wrapper that string-replaced qm.one out of the result.
    // Two of its five call sites bypassed that wrapper, so the same client
    // minted two different domains depending on the code path taken.
    pretendServedFrom(PRODUCTION);
    expect(getInviteUrlBase(true)).not.toContain('qm.one');
    expect(getInviteUrlBase(false)).not.toContain('qm.one');
  });
});

describe('the generated URL base', () => {
  it('uses the /invite/ path for a public link and / for a one-time link', () => {
    expect(getInviteUrlBase(true)).toBe(`https://${PRODUCTION}/invite/`);
    expect(getInviteUrlBase(false)).toBe(`https://${PRODUCTION}/`);
  });

  it('is always https, even when the build is served over http', () => {
    // The old implementation chose http for localhost. A link is for sending to
    // someone else, so it must not inherit the author's transport.
    pretendServedFrom('localhost', '5173');
    expect(getInviteUrlBase(true).startsWith('https://')).toBe(true);
  });

  it('matches what the UI tells the user the domain is', () => {
    pretendServedFrom('localhost', '5173');
    expect(getInviteUrlBase(true)).toContain(getInviteDisplayDomain());
  });
});

describe('acceptance stays permissive', () => {
  it('still accepts production links, which is what everything now generates', () => {
    const prefixes = getValidInvitePrefixes();
    expect(prefixes).toContain(`https://${PRODUCTION}/invite/#`);
  });

  it('still accepts the legacy qm.one form, which nothing generates any more', () => {
    // qm.one is NOT a current domain and nothing in either client emits one.
    // It stays on the ACCEPT side only, for links minted before desktop
    // stopped producing them, which may still sit in chat logs and bookmarks.
    //
    // Keeping it costs a few strings in an array. Dropping it would silently
    // break pasting an old link — and pasting still works regardless of
    // whether the domain resolves, because the entire join payload lives in
    // the hash fragment and the host is never contacted.
    const prefixes = getValidInvitePrefixes();
    expect(prefixes).toContain('https://qm.one/invite/#');
    expect(prefixes).toContain('https://qm.one/#');
  });

  it('accepts localhost dev links when running on localhost', () => {
    pretendServedFrom('localhost', '5173');
    const prefixes = getValidInvitePrefixes();
    expect(prefixes).toContain('http://localhost:5173/invite/#');
  });
});

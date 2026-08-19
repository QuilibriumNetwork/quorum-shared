/**
 * Utility functions for invite link domains.
 *
 * GENERATION IS CANONICAL; ACCEPTANCE IS PERMISSIVE. Every invite link this
 * library builds carries the production domain, whatever build produced it.
 * `getValidInvitePrefixes` below stays broad so links from any environment,
 * including older ones, still parse when someone joins.
 */

import { logger } from './logger';
import { buildValidPrefixes, getEnvironmentInfo } from './environmentDomains';

/**
 * The one domain invite links are ever generated with.
 *
 * `app.quorummessenger.com` rather than the shorter `qm.one` because that is
 * what the mobile client has always hardcoded, and two clients minting
 * different domains for the same Space is the drift this constant exists to
 * end.
 */
const CANONICAL_INVITE_DOMAIN = 'app.quorummessenger.com';

/**
 * Get the base domain for invite links.
 *
 * This used to read `window.location`, so a staging build produced
 * `test.quorummessenger.com` links and a dev build produced `localhost:5173`
 * ones. That was actively harmful rather than merely untidy: the generated URL
 * is persisted into `space.inviteUrl` and replicated to every member on every
 * client, so a link minted on a developer's machine reached real users as a URL
 * they could not open. Mobile's accept-list did not even include the staging
 * host, so such a link failed its `isPublicInvite` check and hid the member
 * share affordance entirely.
 *
 * The domain also carries no information: the entire join payload lives in the
 * hash fragment, and every environment already accepts production-domain links
 * (see `getValidInvitePrefixes`). So environment-awareness here bought nothing
 * and cost link portability.
 *
 * Trade-off accepted: on a non-production build, a generated link no longer
 * deep-links back into that same build. Pasting one into the join field still
 * works, since acceptance is unchanged; only click-through needs the domain
 * edited by hand.
 *
 * @returns The production invite domain, unconditionally.
 */
export function getInviteBaseDomain(): string {
  return CANONICAL_INVITE_DOMAIN;
}

/**
 * Get the full URL base for invite links
 * @param isPublicInvite - Whether this is a public invite (uses /invite/ path)
 * @returns The full URL base for invite links
 */
export function getInviteUrlBase(isPublicInvite: boolean = false): string {
  const path = isPublicInvite ? '/invite/' : '/';
  return `https://${getInviteBaseDomain()}${path}`;
}

/**
 * Get valid invite URL prefixes for validation
 * Uses centralized domain detection from environmentDomains.ts
 * @returns Array of valid URL prefixes that invite links can start with
 */
export function getValidInvitePrefixes(): string[] {
  const { environment } = getEnvironmentInfo();

  // Build prefixes for both invite path variants
  const hashPrefixes = buildValidPrefixes('/#');
  const invitePrefixes = buildValidPrefixes('/invite/#');

  // Production domains should ALWAYS be accepted regardless of current environment
  // This allows mobile-generated links (using qm.one) to work on desktop localhost
  const productionPrefixes = [
    'https://qm.one/#',
    'https://qm.one/invite/#',
    'qm.one/#',
    'qm.one/invite/#',
    'https://app.quorummessenger.com/#',
    'https://app.quorummessenger.com/invite/#',
    'app.quorummessenger.com/#',
    'app.quorummessenger.com/invite/#',
  ];

  // Localhost development: also accept common test ports
  if (environment === 'localhost') {
    return [
      ...hashPrefixes,
      ...invitePrefixes,
      ...productionPrefixes,
      // Keep legacy localhost ports for development
      'http://localhost:5173/#',
      'http://localhost:5173/invite/#',
      'http://localhost:3000/#',
      'http://localhost:3000/invite/#',
    ];
  }

  return [...hashPrefixes, ...invitePrefixes, ...productionPrefixes];
}

/**
 * Format the display domain for UI (without protocol).
 *
 * Now the production domain everywhere, matching what generation produces. A
 * dev build therefore shows the production domain in join-field placeholders;
 * that is correct, because it is the domain the link it builds will carry.
 *
 * @returns The domain for display in UI elements
 */
export function getInviteDisplayDomain(): string {
  return getInviteBaseDomain();
}

/**
 * Parse invite URL parameters from a link's hash portion into a simple map.
 * Accepts both public and private invite variants.
 */
export function parseInviteParams(inviteLink: string):
  | {
      spaceId?: string;
      configKey?: string;
      template?: string;
      secret?: string;
      hubKey?: string;
    }
  | null {
  if (!inviteLink || typeof inviteLink !== 'string') {
    return null;
  }
  const idx = inviteLink.indexOf('#');
  if (idx < 0 || idx === inviteLink.length - 1) {
    return null;
  }
  const hashContent = inviteLink.slice(idx + 1);
  const params = Object.create(null) as Record<string, string>;
  for (const pair of hashContent.split('&')) {
    const [k, v] = pair.split('=');
    if (!k || !v) continue;
    if (
      k === 'spaceId' ||
      k === 'configKey' ||
      k === 'template' ||
      k === 'secret' ||
      k === 'hubKey'
    ) {
      params[k] = v;
      logger.log(`[parseInviteParams] Found param: ${k} = ${v?.substring(0, 30)}...`);
    }
  }
  return Object.keys(params).length ? (params as any) : null;
}

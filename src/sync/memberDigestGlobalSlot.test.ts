/**
 * Can the member digest SEE the identity that actually renders?
 *
 * The sync protocol reconciles space members by comparing `MemberDigest`s: a
 * hash of the display name and a hash of the icon. If two clients' digests
 * match, no member data is exchanged.
 *
 * But the follow-global work (2026-07-16) deliberately stopped stamping the
 * per-space OVERRIDE fields (`display_name` / `profile_image`), so for most
 * members they are EMPTY and the identity that renders lives in the GLOBAL slot
 * (`global_display_name` / `global_user_icon`).
 *
 * If the digest hashes only the override slot, then two clients that disagree
 * completely about a member's identity still produce identical digests, conclude
 * "in sync", and exchange nothing — which would make the whole receiver-driven
 * reconciliation useless for exactly the case it is needed for.
 *
 * See quorum-desktop
 * .agents/bugs/2026-08-01-space-sync-member-delta-blind-to-and-erases-global-slot.md
 */
import { describe, it, expect } from 'vitest';
import { createMemberDigest } from './utils';
import type { SpaceMember } from '../types';

const member = (over: Partial<SpaceMember> = {}): SpaceMember =>
  ({
    address: 'QmNSr2YL6iLho1CQfRNikQRs2mBxGQRSL2CXYmtKL5ihUB',
    inbox_address: 'inbox-1',
    // The normal post-follow-global state: no per-space override.
    display_name: '',
    profile_image: '',
    ...over,
  }) as SpaceMember;

/** A member whose identity lives entirely in the global slot. */
const withGlobal = (name: string, icon: string) =>
  member({
    global_display_name: name,
    global_user_icon: icon,
  } as Partial<SpaceMember>);

describe('createMemberDigest — the global identity slot', () => {
  it('distinguishes a member WITH a global identity from one with none', () => {
    const identified = createMemberDigest(withGlobal('Ada Lovelace', 'data:image/jpeg;base64,REAL'));
    const anonymous = createMemberDigest(member());

    // If these are equal, a peer holding the real identity and a peer holding
    // nothing agree they are in sync, and the identity never transfers.
    expect(identified.displayNameHash).not.toBe(anonymous.displayNameHash);
    expect(identified.iconHash).not.toBe(anonymous.iconHash);
  });

  it('distinguishes two DIFFERENT global identities', () => {
    const a = createMemberDigest(withGlobal('Ada Lovelace', 'data:image/jpeg;base64,AAA'));
    const b = createMemberDigest(withGlobal('Grace Hopper', 'data:image/jpeg;base64,BBB'));

    expect(a.displayNameHash).not.toBe(b.displayNameHash);
    expect(a.iconHash).not.toBe(b.iconHash);
  });

  it('still distinguishes per-space OVERRIDES (the pre-existing behaviour)', () => {
    const a = createMemberDigest(member({ display_name: 'Ada (this space)' }));
    const b = createMemberDigest(member({ display_name: 'Ada (other)' }));
    expect(a.displayNameHash).not.toBe(b.displayNameHash);
  });

  it('is stable for the same input', () => {
    expect(createMemberDigest(withGlobal('Ada', 'icon'))).toEqual(
      createMemberDigest(withGlobal('Ada', 'icon'))
    );
  });
});

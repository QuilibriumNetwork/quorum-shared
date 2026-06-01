/**
 * Public space directory types.
 *
 * Wire shapes returned by GET /directory. Used by both desktop and mobile
 * to render the "Discover Spaces" surface — a curated/server-side list of
 * public spaces a user can browse and join without a private invite link.
 */

export type SpaceCategory =
  | 'community'
  | 'gaming'
  | 'tech'
  | 'crypto'
  | 'social'
  | 'education'
  | 'other';

export interface DirectoryEntry {
  space_address: string;
  name: string;
  description: string;
  icon: string;
  invite_link: string;
  category: string;
  status: string;
  submitted_at: number;
  reviewed_at?: number;
  member_count?: number;
}

export interface DirectoryResponse {
  entries: DirectoryEntry[];
  total: number;
  has_more: boolean;
}

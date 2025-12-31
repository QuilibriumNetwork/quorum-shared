/**
 * User-related types for Quorum
 */

import type { Bookmark } from './bookmark';

export type FolderColor = string;

export type NavItem =
  | { type: 'space'; id: string }
  | {
      type: 'folder';
      id: string;
      name: string;
      spaceIds: string[];
      icon?: string;
      color?: FolderColor;
      createdDate: number;
      modifiedDate: number;
    };

export type NotificationSettings = {
  enabled?: boolean;
  mentions?: boolean;
  replies?: boolean;
  all?: boolean;
};

export type UserConfig = {
  address: string;
  spaceIds: string[];
  items?: NavItem[];
  timestamp?: number;
  nonRepudiable?: boolean;
  allowSync?: boolean;
  name?: string;
  profile_image?: string;
  spaceKeys?: {
    spaceId: string;
    encryptionState: {
      conversationId: string;
      inboxId: string;
      state: string;
      timestamp: number;
    };
    keys: {
      keyId: string;
      address?: string;
      publicKey: string;
      privateKey: string;
      spaceId: string;
    }[];
  }[];
  notificationSettings?: {
    [spaceId: string]: NotificationSettings;
  };
  bookmarks?: Bookmark[];
  deletedBookmarkIds?: string[];
};

export type UserProfile = {
  address: string;
  name?: string;
  display_name?: string;
  profile_image?: string;
  bio?: string;
};

export type SpaceMember = UserProfile & {
  inbox_address: string;
  isKicked?: boolean;
};

/**
 * Space-related types for Quorum
 */

export type SpaceTag = {
  letters: string;
  url: string;
};

export type BroadcastSpaceTag = SpaceTag & {
  spaceId: string;
};

export type Permission = 'message:delete' | 'message:pin' | 'mention:everyone' | 'user:mute';

export type Role = {
  roleId: string;
  displayName: string;
  roleTag: string;
  /**
   * Portable color for the role's badge. Store a named palette token from the
   * shared icon-color vocabulary (e.g. 'blue', 'green' — see `ROLE_COLORS` /
   * `IconColor`), NOT a raw platform color and never a CSS variable. Resolve to
   * a render hex with `getRoleColorHex()`, which also tolerates legacy values
   * (raw hex from old mobile roles, the legacy desktop 'rgb(var(--success))').
   * Kept as `string` for wire-compat; treat new writes as a token.
   */
  color: string;
  members: string[];
  permissions: Permission[];
  isPublic?: boolean;
};

export type Emoji = {
  name: string;
  id: string;
  imgUrl: string;
};

export type Sticker = {
  name: string;
  id: string;
  imgUrl: string;
};

export type Group = {
  groupName: string;
  channels: Channel[];
  icon?: string;
  iconColor?: string;
  iconVariant?: 'outline' | 'filled';
};

export type Channel = {
  channelId: string;
  spaceId: string;
  channelName: string;
  channelTopic?: string;
  channelKey?: string;
  createdDate: number;
  modifiedDate: number;
  mentionCount?: number;
  mentions?: string;
  isReadOnly?: boolean;
  managerRoleIds?: string[];
  icon?: string;
  iconColor?: string;
  iconVariant?: 'outline' | 'filled';
  allowThreads?: boolean;
};

export type Space = {
  spaceId: string;
  spaceName: string;
  description?: string;
  vanityUrl: string;
  inviteUrl: string;
  iconUrl: string;
  bannerUrl: string;
  defaultChannelId: string;
  hubAddress: string;
  createdDate: number;
  modifiedDate: number;
  isRepudiable: boolean;
  isPublic: boolean;
  saveEditHistory?: boolean;
  groups: Group[];
  roles: Role[];
  emojis: Emoji[];
  stickers: Sticker[];
  spaceTag?: SpaceTag;
  allowThreads?: boolean;
};

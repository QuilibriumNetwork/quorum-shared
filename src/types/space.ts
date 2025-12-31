/**
 * Space-related types for Quorum
 */

export type Permission = 'message:delete' | 'message:pin' | 'mention:everyone' | 'user:mute';

export type Role = {
  roleId: string;
  displayName: string;
  roleTag: string;
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
  channelTopic: string;
  channelKey?: string;
  createdDate: number;
  modifiedDate: number;
  mentionCount?: number;
  mentions?: string;
  isReadOnly?: boolean;
  managerRoleIds?: string[];
  isPinned?: boolean;
  pinnedAt?: number;
  icon?: string;
  iconColor?: string;
  iconVariant?: 'outline' | 'filled';
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
};

import { UserIdentity } from './ws-types';

export type RoomVisibility = 'public' | 'friends-only' | 'invite-only';

export interface Room {
  id: number;
  name: string;
  ownerId: number;
  ownerDisplayName: string;
  visibility: RoomVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface RoomResponse extends Room {
  onlineCount: number;
}

export interface CreateRoomRequest {
  name: string;
  visibility?: RoomVisibility;
  invitedUserIds?: number[];
}

export interface UpdateRoomRequest {
  name?: string;
  visibility?: RoomVisibility;
}

export interface RoomMemberInfo {
  userId: number;
  username: string;
  displayName: string | null;
}

export interface RoomInviteResponse extends RoomMemberInfo {
  invitedAt: string;
}

export interface RoomBanResponse extends RoomMemberInfo {
  bannedAt: string;
}

export interface InviteUserRequest {
  userId: number;
}

export interface BanUserRequest {
  userId: number;
}

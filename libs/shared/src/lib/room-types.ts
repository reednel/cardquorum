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
  memberLimit: number | null;
  rosterCount: number;
  isOnRoster: boolean;
}

export interface CreateRoomRequest {
  name: string;
  visibility?: RoomVisibility;
  invitedUserIds?: number[];
  memberLimit?: number | null;
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

// --- Roster types ---

export type RosterSection = 'players' | 'spectators';

export interface RosterMember {
  userId: number;
  username: string;
  displayName: string | null;
  section: RosterSection;
  position: number;
}

export interface RosterState {
  players: RosterMember[];
  spectators: RosterMember[];
  rotatePlayers: boolean;
}

export interface RosterUpdatePayload {
  roomId: number;
  roster: RosterState;
}

export interface UpdateRosterRequest {
  players: number[];
  spectators: number[];
}

export interface KickUserRequest {
  userId: number;
}

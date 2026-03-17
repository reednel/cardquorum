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
}

export interface UpdateRoomRequest {
  name?: string;
  visibility?: RoomVisibility;
}

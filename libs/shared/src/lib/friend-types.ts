import { UserSearchResult } from './user-types';

export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendshipResponse {
  friendshipId: number;
  user: UserSearchResult;
  status: FriendshipStatus;
  createdAt: string;
}

export interface FriendRequestBody {
  userId: number;
}

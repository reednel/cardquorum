import { UserSearchResult } from './user-types';

export interface FriendshipResponse {
  friendshipId: number;
  user: UserSearchResult;
  createdAt: string;
}

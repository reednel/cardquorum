export interface UserProfile {
  userId: number;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
}

export interface UserSearchResult {
  userId: number;
  username: string;
  displayName: string | null;
}

export interface UpdateUsernameRequest {
  username: string;
}

export interface UpdateDisplayNameRequest {
  displayName: string | null;
}

export interface DeleteAccountRequest {
  password?: string;
}

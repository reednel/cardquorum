import { UserIdentity } from './ws-types';

export type AuthStrategy = 'basic' | 'oidc';

export type AuthMethod = 'basic' | 'oidc';

export interface SessionIdentity extends UserIdentity {
  authMethod: AuthMethod;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface StrategiesResponse {
  strategies: AuthStrategy[];
}

export interface CredentialsResponse {
  methods: AuthMethod[];
}

export interface LinkBasicCredentialRequest {
  password: string;
}

export interface UnlinkBasicCredentialRequest {
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export { WS_EVENT, WS_EMIT } from './lib/ws-events';
export type {
  UserIdentity,
  JoinRoomPayload,
  LeaveRoomPayload,
  SendMessagePayload,
  RoomJoinedPayload,
  MemberChangePayload,
  ChatMessagePayload,
  MessageHistoryPayload,
  RoomDeletedPayload,
  WsErrorPayload,
  GameCreatePayload,
  GameStartPayload,
  GameActionPayload,
  GameRejoinPayload,
  GameCancelPayload,
  GameCreatedPayload,
  GameStartedPayload,
  GameStateUpdatePayload,
  GameOverPayload,
  GameErrorPayload,
  GameCancelledPayload,
} from './lib/ws-types';
export type {
  Room,
  RoomVisibility,
  RoomResponse,
  CreateRoomRequest,
  UpdateRoomRequest,
} from './lib/room-types';
export type {
  AuthMethod,
  AuthStrategy,
  CredentialsResponse,
  LinkBasicCredentialRequest,
  LoginRequest,
  RegisterRequest,
  SessionIdentity,
  StrategiesResponse,
  UnlinkBasicCredentialRequest,
} from './lib/auth-types';
export type { GameType, GameSessionStatus } from './lib/game-types';
export type {
  UserProfile,
  UserSearchResult,
  UpdateUsernameRequest,
  UpdateDisplayNameRequest,
  DeleteAccountRequest,
} from './lib/user-types';
export type { FriendshipStatus, FriendshipResponse, FriendRequestBody } from './lib/friend-types';
export {
  USERNAME_MIN,
  USERNAME_MAX,
  USERNAME_PATTERN,
  DISPLAY_NAME_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
  isValidUsername,
} from './lib/validation';

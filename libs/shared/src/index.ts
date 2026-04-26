export { WS_EVENT, WS_EMIT } from './lib/ws-events';
export type {
  UserIdentity,
  JoinRoomPayload,
  LeaveRoomPayload,
  SendMessagePayload,
  RoomJoinedPayload,
  MemberChangePayload,
  MemberKickedPayload,
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
  LeaveRosterPayload,
  RosterReorderPayload,
  RosterToggleRotatePayload,
} from './lib/ws-types';
export type {
  Room,
  RoomVisibility,
  RoomResponse,
  CreateRoomRequest,
  UpdateRoomRequest,
  PaginatedResponse,
  RoomMemberInfo,
  RoomInviteResponse,
  RoomBanResponse,
  InviteUserRequest,
  BanUserRequest,
  RosterSection,
  RosterMember,
  RotationMode,
  RosterState,
  RosterUpdatePayload,
  UpdateRosterRequest,
  KickUserRequest,
  RoomGameSettings,
  RosterToggleReadyPayload,
  GameAbandonPayload,
  RosterSetRotationModePayload,
  GameSettingsUpdatePayload,
  GameSettingsUpdatedPayload,
  GameSettingsLoadedPayload,
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
  ChangePasswordRequest,
} from './lib/auth-types';
export type { GameType, GameSessionStatus } from './lib/game-types';
export type {
  UserProfile,
  UserSearchResult,
  UpdateUsernameRequest,
  UpdateDisplayNameRequest,
  DeleteAccountRequest,
} from './lib/user-types';
export type { FriendshipResponse } from './lib/friend-types';
export type { FriendRequestBody, FriendRequestResponse } from './lib/friend-request-types';
export type { BlockedUserResponse, BlockUserRequest } from './lib/block-types';
export type {
  CardAsset,
  SeatInfo,
  TrickPlayView,
  StatusInfo,
  GameTablePlugin,
} from './lib/game-table-types';
export {
  USERNAME_MIN,
  USERNAME_MAX,
  USERNAME_PATTERN,
  DISPLAY_NAME_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
  isValidUsername,
} from './lib/validation';

export { PALETTE_HUES } from './lib/color-types';
export type { ColorAssignmentMap } from './lib/color-types';
export {
  circularHueDistance,
  minimumDistanceThreshold,
  isValidPaletteHue,
  hueToHsl,
} from './lib/color-utils';

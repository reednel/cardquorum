import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  JoinRoomPayload,
  LeaveRoomPayload,
  LeaveRosterPayload,
  RosterReorderPayload,
  RosterToggleRotatePayload,
} from '@cardquorum/shared';

export class JoinRoomDto implements JoinRoomPayload {
  @IsInt()
  @Min(1)
  roomId!: number;
}

export class LeaveRoomDto implements LeaveRoomPayload {
  @IsInt()
  @Min(1)
  roomId!: number;
}

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(['public', 'friends-only', 'invite-only'])
  visibility?: 'public' | 'friends-only' | 'invite-only';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  invitedUserIds?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  memberLimit?: number;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['public', 'friends-only', 'invite-only'])
  visibility?: 'public' | 'friends-only' | 'invite-only';
}

export class RoomUserDto {
  @IsInt()
  @Min(1)
  userId!: number;
}

export class LeaveRosterDto implements LeaveRosterPayload {
  @IsInt()
  @Min(1)
  roomId!: number;
}

export class RosterReorderDto implements RosterReorderPayload {
  @IsInt()
  @Min(1)
  roomId!: number;

  @IsArray()
  @IsInt({ each: true })
  players!: number[];

  @IsArray()
  @IsInt({ each: true })
  spectators!: number[];
}

export class RosterToggleRotateDto implements RosterToggleRotatePayload {
  @IsInt()
  @Min(1)
  roomId!: number;

  @IsBoolean()
  enabled!: boolean;
}

// --- REST DTOs (no roomId — it comes from the URL param) ---

export class UpdateRosterDto {
  @IsArray()
  @IsInt({ each: true })
  players!: number[];

  @IsArray()
  @IsInt({ each: true })
  spectators!: number[];
}

export class ToggleRotateDto {
  @IsBoolean()
  enabled!: boolean;
}

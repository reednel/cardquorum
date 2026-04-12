import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  GameSettingsUpdatePayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  LeaveRosterPayload,
  RoomGameSettings,
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
  @MaxLength(256)
  description?: string;

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
  @MaxLength(256)
  description?: string;

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

// --- Game Settings DTOs ---

export class RoomGameSettingsDto implements RoomGameSettings {
  @IsOptional()
  @IsString()
  gameType!: string | null;

  @IsOptional()
  @IsString()
  presetName!: string | null;

  @IsObject()
  config!: Record<string, unknown>;

  @IsBoolean()
  autostart!: boolean;
}

export class GameSettingsUpdateDto implements GameSettingsUpdatePayload {
  @IsInt()
  @Min(1)
  roomId!: number;

  @ValidateNested()
  @Type(() => RoomGameSettingsDto)
  settings!: RoomGameSettingsDto;
}

export class GameSettingsLoadDto {
  @IsInt()
  @Min(1)
  roomId!: number;
}

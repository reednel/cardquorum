import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { JoinRoomPayload, LeaveRoomPayload } from '@cardquorum/shared';

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

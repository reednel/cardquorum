import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  type GameActionPayload,
  type GameCancelPayload,
  type GameCreatePayload,
  type GameRejoinPayload,
  type GameStartPayload,
} from '@cardquorum/shared';

export class GameCreateDto implements GameCreatePayload {
  @IsInt()
  @Min(1)
  declare roomId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  declare gameType: string;

  @IsObject()
  declare config: unknown;
}

export class GameStartDto implements GameStartPayload {
  @IsInt()
  @Min(1)
  declare sessionId: number;
}

class GameActionInner {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  declare type: string;

  @IsOptional()
  payload?: unknown;
}

export class GameActionDto implements GameActionPayload {
  @IsInt()
  @Min(1)
  declare sessionId: number;

  @ValidateNested()
  @Type(() => GameActionInner)
  declare action: GameActionInner;
}

export class GameRejoinDto implements GameRejoinPayload {
  @IsInt()
  @Min(1)
  declare roomId: number;
}

export class GameCancelDto implements GameCancelPayload {
  @IsInt()
  @Min(1)
  declare sessionId: number;
}

export class GameAbandonDto {
  @IsInt()
  @Type(() => Number)
  declare sessionId: number;
}

export class GameLogHistoryDto {
  @IsInt()
  @Min(1)
  declare roomId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cursor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class GameForceAbandonDto {
  @IsInt()
  @Min(1)
  declare sessionId: number;

  @IsInt()
  @Min(1)
  declare targetUserId: number;
}

export class GameQueryTargetsDto {
  @IsInt()
  @Min(1)
  declare sessionId: number;

  @IsString()
  @IsNotEmpty()
  declare sourceStackId: string;

  @IsArray()
  @IsString({ each: true })
  declare selectedCards: string[];

  @IsInt()
  @Min(0)
  declare generation: number;
}

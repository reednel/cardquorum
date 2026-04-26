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
  GameActionPayload,
  GameCancelPayload,
  GameCreatePayload,
  GameRejoinPayload,
  GameStartPayload,
} from '@cardquorum/shared';

export class GameCreateDto implements GameCreatePayload {
  @IsInt()
  @Min(1)
  roomId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  gameType: string;

  @IsObject()
  config: unknown;
}

export class GameStartDto implements GameStartPayload {
  @IsInt()
  @Min(1)
  sessionId: number;
}

class GameActionInner {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  @IsOptional()
  payload?: unknown;
}

export class GameActionDto implements GameActionPayload {
  @IsInt()
  @Min(1)
  sessionId: number;

  @ValidateNested()
  @Type(() => GameActionInner)
  action: GameActionInner;
}

export class GameRejoinDto implements GameRejoinPayload {
  @IsInt()
  @Min(1)
  roomId: number;
}

export class GameCancelDto implements GameCancelPayload {
  @IsInt()
  @Min(1)
  sessionId: number;
}

export class GameAbandonDto {
  @IsInt()
  @Type(() => Number)
  sessionId: number;
}

export class GameQueryTargetsDto {
  @IsInt()
  @Min(1)
  sessionId: number;

  @IsString()
  @IsNotEmpty()
  sourceStackId: string;

  @IsArray()
  @IsString({ each: true })
  selectedCards: string[];

  @IsInt()
  @Min(0)
  generation: number;
}

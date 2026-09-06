import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { type SendMessagePayload } from '@cardquorum/shared';

export const MAX_MESSAGE_LENGTH = 10_000;

export class SendMessageDto implements SendMessagePayload {
  @IsInt()
  @Min(1)
  declare roomId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  declare content: string;
}

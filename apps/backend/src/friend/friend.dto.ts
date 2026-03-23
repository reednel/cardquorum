import { IsInt, Min } from 'class-validator';
import { FriendRequestBody } from '@cardquorum/shared';

export class FriendRequestDto implements FriendRequestBody {
  @IsInt()
  @Min(1)
  userId!: number;
}

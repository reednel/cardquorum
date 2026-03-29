import { IsInt, Min } from 'class-validator';
import { BlockUserRequest } from '@cardquorum/shared';

export class BlockUserDto implements BlockUserRequest {
  @IsInt()
  @Min(1)
  userId!: number;
}

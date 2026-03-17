import { IsInt, Min } from 'class-validator';
import { JoinRoomPayload, LeaveRoomPayload } from '@cardquorum/shared';

export class JoinRoomDto implements JoinRoomPayload {
  @IsInt()
  @Min(1)
  roomId: number;
}

export class LeaveRoomDto implements LeaveRoomPayload {
  @IsInt()
  @Min(1)
  roomId: number;
}

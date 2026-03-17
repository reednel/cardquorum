import { Module } from '@nestjs/common';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

@Module({
  providers: [RoomService, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}

import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [RoomModule],
  providers: [GameService, GameGateway],
  exports: [GameService],
})
export class GameModule {}

import { forwardRef, Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { EventLogService } from './event-log.service';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [forwardRef(() => RoomModule)],
  providers: [GameService, GameGateway, EventLogService],
  exports: [GameService],
})
export class GameModule {}

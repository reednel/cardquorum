import { forwardRef, Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { StatsModule } from '../stats/stats.module';
import { EventLogService } from './event-log.service';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [forwardRef(() => RoomModule), StatsModule],
  providers: [GameService, GameGateway, EventLogService],
  exports: [GameService],
})
export class GameModule {}

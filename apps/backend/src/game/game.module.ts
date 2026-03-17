import { forwardRef, Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [forwardRef(() => RoomModule)],
  providers: [GameService, GameGateway],
  exports: [GameService],
})
export class GameModule {}

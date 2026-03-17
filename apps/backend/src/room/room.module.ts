import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

@Module({
  imports: [AuthModule, forwardRef(() => GameModule)],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}

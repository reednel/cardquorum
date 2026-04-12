import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlockModule } from '../block/block.module';
import { ColorModule } from '../color/color.module';
import { FriendModule } from '../friend/friend.module';
import { GameModule } from '../game/game.module';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

@Module({
  imports: [AuthModule, BlockModule, ColorModule, FriendModule, forwardRef(() => GameModule)],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}

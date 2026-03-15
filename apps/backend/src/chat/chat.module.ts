import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomModule } from '../room/room.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, RoomModule],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}

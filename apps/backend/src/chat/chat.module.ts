import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomModule } from '../room/room.module';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule, RoomModule],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}

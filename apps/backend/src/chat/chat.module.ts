import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [RoomModule],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}

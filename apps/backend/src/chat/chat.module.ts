import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [RoomModule],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}

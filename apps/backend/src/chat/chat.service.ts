import { Injectable } from '@nestjs/common';
import { ChatMessagePayload } from '@cardquorum/shared';
import { MessageRepository } from '@cardquorum/db';

@Injectable()
export class ChatService {
  constructor(private readonly messages: MessageRepository) {}

  async saveMessage(
    roomId: string,
    senderUserId: string,
    senderNickname: string,
    content: string,
  ): Promise<ChatMessagePayload> {
    return this.messages.insert(roomId, senderUserId, senderNickname, content);
  }

  async getRecentMessages(roomId: string, limit = 50): Promise<ChatMessagePayload[]> {
    return this.messages.findByRoomId(roomId, limit);
  }
}

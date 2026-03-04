import { Injectable } from '@nestjs/common';
import { ChatMessagePayload } from '@cardquorum/shared';
import { MessageRepository } from '@cardquorum/db';

@Injectable()
export class ChatService {
  constructor(private readonly messages: MessageRepository) {}

  async saveMessage(
    roomId: number,
    senderUserId: number,
    senderDisplayName: string,
    content: string,
  ): Promise<ChatMessagePayload> {
    return this.messages.insert(roomId, senderUserId, senderDisplayName, content);
  }

  async getRecentMessages(roomId: number, limit = 50): Promise<ChatMessagePayload[]> {
    return this.messages.findByRoomId(roomId, limit);
  }
}

import { Injectable } from '@nestjs/common';
import { MessageRepository } from '@cardquorum/db';
import { ChatMessagePayload } from '@cardquorum/shared';

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

import { Injectable } from '@nestjs/common';
import { RoomManager } from '@cardquorum/engine';
import { RoomRepository } from '@cardquorum/db';

@Injectable()
export class RoomService {
  readonly manager = new RoomManager();

  constructor(private readonly rooms: RoomRepository) {}

  /** Ensure the room exists in Postgres (upsert by id). */
  async ensureRoomExists(roomId: string): Promise<void> {
    await this.rooms.ensureExists(roomId);
  }
}

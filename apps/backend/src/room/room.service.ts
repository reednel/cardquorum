import { Injectable } from '@nestjs/common';
import { RoomManager } from '@cardquorum/engine';
import { RoomRepository } from '@cardquorum/db';

@Injectable()
export class RoomService {
  readonly manager = new RoomManager();

  constructor(private readonly rooms: RoomRepository) {}

  async roomExists(roomId: number): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    return room !== null;
  }
}

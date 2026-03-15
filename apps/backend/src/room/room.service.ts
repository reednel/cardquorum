import { Injectable } from '@nestjs/common';
import { RoomRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';

@Injectable()
export class RoomService {
  readonly manager = new RoomManager();

  constructor(private readonly rooms: RoomRepository) {}

  async roomExists(roomId: number): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    return room !== null;
  }
}

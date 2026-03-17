import { Injectable, Logger } from '@nestjs/common';
import { RoomRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { WsConnectionService } from '../ws/ws-connection.service';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  readonly manager = new RoomManager();

  constructor(
    private readonly rooms: RoomRepository,
    private readonly connectionService: WsConnectionService,
  ) {}

  async roomExists(roomId: number): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    return room !== null;
  }

  broadcastToRoom(roomId: string, event: string, data: unknown, excludeConnId?: string): void {
    const room = this.manager.getRoom(roomId);
    if (!room) return;

    const message = JSON.stringify({ event, data });
    for (const connId of room.members.keys()) {
      if (connId === excludeConnId) continue;
      const tracked = this.connectionService.getTrackedById(connId);
      if (tracked) {
        try {
          tracked.ws.send(message);
        } catch (err) {
          this.logger.warn(`Failed to send to ${connId}: ${err}`);
        }
      }
    }
  }
}

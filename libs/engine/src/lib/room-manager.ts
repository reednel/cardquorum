import { UserIdentity } from '@cardquorum/shared';

export interface RoomState {
  id: string;
  /** connectionId → UserIdentity */
  members: Map<string, UserIdentity>;
}

/**
 * Pure TypeScript room tracker. No framework dependencies.
 * Games extend or compose with this for game-specific state.
 */
export class RoomManager {
  private rooms = new Map<string, RoomState>();
  /** connectionId → Set of room IDs */
  private connectionRooms = new Map<string, Set<string>>();

  createRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (room) return room;

    room = { id: roomId, members: new Map() };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, connectionId: string, identity: UserIdentity): RoomState {
    const room = this.createRoom(roomId);
    room.members.set(connectionId, identity);

    let rooms = this.connectionRooms.get(connectionId);
    if (!rooms) {
      rooms = new Set();
      this.connectionRooms.set(connectionId, rooms);
    }
    rooms.add(roomId);

    return room;
  }

  leaveRoom(roomId: string, connectionId: string): UserIdentity | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const identity = room.members.get(connectionId);
    if (!identity) return undefined;

    room.members.delete(connectionId);

    // Clean up empty rooms
    if (room.members.size === 0) {
      this.rooms.delete(roomId);
    }

    // Update connection tracking
    const rooms = this.connectionRooms.get(connectionId);
    if (rooms) {
      rooms.delete(roomId);
      if (rooms.size === 0) {
        this.connectionRooms.delete(connectionId);
      }
    }

    return identity;
  }

  /** Remove a connection from all rooms. Returns array of [roomId, identity] for broadcasting departures. */
  leaveAllRooms(connectionId: string): Array<{ roomId: string; identity: UserIdentity }> {
    const rooms = this.connectionRooms.get(connectionId);
    if (!rooms) return [];

    const departures: Array<{ roomId: string; identity: UserIdentity }> = [];
    for (const roomId of rooms) {
      const room = this.rooms.get(roomId);
      if (!room) continue;

      const identity = room.members.get(connectionId);
      if (identity) {
        departures.push({ roomId, identity });
        room.members.delete(connectionId);
        if (room.members.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    }

    this.connectionRooms.delete(connectionId);
    return departures;
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getRoomMembers(roomId: string): UserIdentity[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.members.values());
  }

  getConnectionRooms(connectionId: string): string[] {
    const rooms = this.connectionRooms.get(connectionId);
    return rooms ? Array.from(rooms) : [];
  }
}

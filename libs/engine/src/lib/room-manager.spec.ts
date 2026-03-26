import { UserIdentity } from '@cardquorum/shared';
import { RoomManager } from './room-manager';

describe('RoomManager', () => {
  let manager: RoomManager;

  const alice: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bob: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };

  beforeEach(() => {
    manager = new RoomManager();
  });

  describe('createRoom', () => {
    it('should create a new empty room', () => {
      const room = manager.createRoom('room-1');
      expect(room.id).toBe('room-1');
      expect(room.members.size).toBe(0);
    });

    it('should be idempotent — returns existing room', () => {
      const first = manager.createRoom('room-1');
      const second = manager.createRoom('room-1');
      expect(first).toBe(second);
    });
  });

  describe('joinRoom', () => {
    it('should add a member and create room if needed', () => {
      const room = manager.joinRoom('room-1', 'conn-1', alice);
      expect(room.members.get('conn-1')).toEqual(alice);
    });

    it('should track multiple members in a room', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      manager.joinRoom('room-1', 'conn-2', bob);
      expect(manager.getRoomMembers('room-1')).toEqual([alice, bob]);
    });

    it('should track which rooms a connection belongs to', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      manager.joinRoom('room-2', 'conn-1', alice);
      expect(manager.getConnectionRooms('conn-1')).toEqual(['room-1', 'room-2']);
    });
  });

  describe('leaveRoom', () => {
    it('should remove a member and return their identity', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      const identity = manager.leaveRoom('room-1', 'conn-1');
      expect(identity).toEqual(alice);
      expect(manager.getRoomMembers('room-1')).toEqual([]);
    });

    it('should clean up empty rooms', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      manager.leaveRoom('room-1', 'conn-1');
      expect(manager.getRoom('room-1')).toBeUndefined();
    });

    it('should return undefined for unknown room', () => {
      expect(manager.leaveRoom('nope', 'conn-1')).toBeUndefined();
    });

    it('should return undefined for unknown connection in room', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      expect(manager.leaveRoom('room-1', 'conn-999')).toBeUndefined();
    });

    it('should keep room alive while other members remain', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      manager.joinRoom('room-1', 'conn-2', bob);
      manager.leaveRoom('room-1', 'conn-1');
      expect(manager.getRoom('room-1')).toBeDefined();
      expect(manager.getRoomMembers('room-1')).toEqual([bob]);
    });
  });

  describe('leaveAllRooms', () => {
    it('should remove connection from all rooms and return departures', () => {
      manager.joinRoom('room-1', 'conn-1', alice);
      manager.joinRoom('room-2', 'conn-1', alice);
      manager.joinRoom('room-1', 'conn-2', bob);

      const departures = manager.leaveAllRooms('conn-1');
      expect(departures).toEqual([
        { roomId: 'room-1', identity: alice },
        { roomId: 'room-2', identity: alice },
      ]);

      // room-1 still has bob, room-2 cleaned up
      expect(manager.getRoom('room-1')).toBeDefined();
      expect(manager.getRoom('room-2')).toBeUndefined();
      expect(manager.getConnectionRooms('conn-1')).toEqual([]);
    });

    it('should return empty array for unknown connection', () => {
      expect(manager.leaveAllRooms('conn-999')).toEqual([]);
    });
  });

  describe('getRoom / getRoomMembers / getConnectionRooms', () => {
    it('should return undefined for nonexistent room', () => {
      expect(manager.getRoom('nope')).toBeUndefined();
    });

    it('should return empty array for nonexistent room members', () => {
      expect(manager.getRoomMembers('nope')).toEqual([]);
    });

    it('should return empty array for unknown connection rooms', () => {
      expect(manager.getConnectionRooms('nope')).toEqual([]);
    });
  });
});

import { WebSocket } from 'ws';
import { RosterState, UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { GameService } from '../game/game.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

describe('RoomGateway', () => {
  let gateway: RoomGateway;
  let connectionService: WsConnectionService;
  let roomService: RoomService;
  let gameService: jest.Mocked<Pick<GameService, 'isGameActive'>>;

  const aliceIdentity: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bobIdentity: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };
  const charlieIdentity: UserIdentity = { userId: 3, username: 'charlie', displayName: 'Charlie' };

  const emptyRoster: RosterState = { players: [], spectators: [], rotatePlayers: false };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  /** Helper to parse all messages sent to a mock client */
  const parseSentMessages = (client: WebSocket) =>
    (client.send as jest.Mock).mock.calls.map((c: any) => JSON.parse(c[0]));

  beforeEach(() => {
    const { RoomManager } = jest.requireActual('@cardquorum/engine');

    connectionService = new WsConnectionService();

    const manager = new RoomManager();
    roomService = {
      manager,
      roomExists: jest.fn().mockResolvedValue(true),
      canAccessRoom: jest.fn().mockResolvedValue(true),
      findById: jest.fn().mockResolvedValue({ id: 1, ownerId: 1 }),
      getRoster: jest.fn().mockResolvedValue(emptyRoster),
      addToRoster: jest.fn().mockResolvedValue(emptyRoster),
      removeFromRoster: jest.fn().mockResolvedValue(emptyRoster),
      reorderRoster: jest.fn().mockResolvedValue(emptyRoster),
      isMember: jest.fn().mockResolvedValue(false),
      getMessageHistory: jest.fn().mockResolvedValue([]),
      upsertGameSettings: jest.fn().mockResolvedValue({}),
      loadGameSettings: jest.fn().mockResolvedValue(null),
      broadcastToRoom: jest.fn(
        (roomId: string, event: string, data: unknown, excludeConnId?: string) => {
          const room = manager.getRoom(roomId);
          if (!room) return;
          const message = JSON.stringify({ event, data });
          for (const connId of room.members.keys()) {
            if (connId === excludeConnId) continue;
            const tracked = connectionService.getTrackedById(connId);
            if (tracked) tracked.ws.send(message);
          }
        },
      ),
    } as any;

    gameService = {
      isGameActive: jest.fn().mockReturnValue(false),
    };

    gateway = new RoomGateway(
      connectionService,
      roomService,
      gameService as unknown as GameService,
    );
    gateway.onModuleInit();
  });

  describe('handleJoinRoom', () => {
    it('should check room exists and send joined + history', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 1 });

      expect(roomService.roomExists).toHaveBeenCalledWith(1);
      expect(roomService.getMessageHistory).toHaveBeenCalledWith(1);

      const mockSend = client.send as jest.Mock;
      expect(mockSend).toHaveBeenCalledTimes(2);
      const calls = mockSend.mock.calls.map((c: any) => JSON.parse(c[0]).event);
      expect(calls).toContain(WS_EMIT.ROOM_JOINED);
      expect(calls).toContain(WS_EMIT.MESSAGE_HISTORY);
    });

    it('should send error if room does not exist', async () => {
      (roomService.roomExists as jest.Mock).mockResolvedValue(false);
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 999 });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.ERROR);
      expect(parsed.data.message).toBe('Room does not exist');
    });

    it('should broadcast member joined to other room members', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      (client1.send as jest.Mock).mockClear();

      await gateway.handleJoinRoom(client2, { roomId: 1 });

      // client1 should get MEMBER_JOINED for Bob
      const calls = (client1.send as jest.Mock).mock.calls.map((c: any) => JSON.parse(c[0]).event);
      expect(calls).toContain(WS_EMIT.MEMBER_JOINED);
    });
  });

  describe('handleLeaveRoom', () => {
    it('should remove member and broadcast departure', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      (client2.send as jest.Mock).mockClear();
      gateway.handleLeaveRoom(client1, { roomId: 1 });

      const parsed = JSON.parse((client2.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
    });
  });

  describe('disconnect cleanup', () => {
    it('should broadcast departures to remaining room members', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      (client2.send as jest.Mock).mockClear();
      await connectionService.notifyDisconnect(client1);

      const parsed = JSON.parse((client2.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
      expect(parsed.data.member.displayName).toBe('Alice');
    });
  });

  describe('join flow with roster', () => {
    it('should include roster in ROOM_JOINED payload for new member', async () => {
      const rosterWithBob: RosterState = {
        players: [],
        spectators: [
          {
            userId: 2,
            username: 'bob',
            displayName: 'Bob',
            section: 'spectators',
            position: 0,
            assignedHue: null,
          },
        ],
        rotatePlayers: false,
      };
      (roomService.addToRoster as jest.Mock).mockResolvedValue(rosterWithBob);

      const client = createMockClient();
      connectionService.trackClient(client, bobIdentity);

      await gateway.handleJoinRoom(client, { roomId: 1 });

      const messages = parseSentMessages(client);
      const joinedMsg = messages.find((m: any) => m.event === WS_EMIT.ROOM_JOINED);
      expect(joinedMsg).toBeDefined();
      expect(joinedMsg.data.roster).toEqual(rosterWithBob);
    });

    it('should call addToRoster when user is not already on roster', async () => {
      (roomService.isMember as jest.Mock).mockResolvedValue(false);

      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 1 });

      expect(roomService.addToRoster).toHaveBeenCalledWith(1, aliceIdentity.userId);
    });

    it('should call getRoster (not addToRoster) when user is already on roster', async () => {
      (roomService.isMember as jest.Mock).mockResolvedValue(true);

      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 1 });

      expect(roomService.addToRoster).not.toHaveBeenCalled();
      expect(roomService.getRoster).toHaveBeenCalledWith(1);
    });

    it('should send error and undo WS join when room is full', async () => {
      (roomService.isMember as jest.Mock).mockResolvedValue(false);
      (roomService.addToRoster as jest.Mock).mockRejectedValue(
        new Error('Room is full (limit: 2)'),
      );

      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 1 });

      const messages = parseSentMessages(client);
      expect(messages).toHaveLength(1);
      expect(messages[0].event).toBe(WS_EMIT.ERROR);
      expect(messages[0].data.message).toContain('Room is full');

      // User should not be in the room after rejection
      const members = roomService.manager.getRoomMembers('1');
      expect(members.find((m) => m.userId === aliceIdentity.userId)).toBeUndefined();
    });
  });

  describe('kick flow', () => {
    it('should deliver MEMBER_KICKED to the kicked user via kickUserFromRoom', async () => {
      // Set up: Alice (owner) and Bob both join room 1
      const ownerClient = createMockClient();
      const bobClient = createMockClient();
      connectionService.trackClient(ownerClient, aliceIdentity);
      connectionService.trackClient(bobClient, bobIdentity);

      await gateway.handleJoinRoom(ownerClient, { roomId: 1 });
      await gateway.handleJoinRoom(bobClient, { roomId: 1 });

      (ownerClient.send as jest.Mock).mockClear();
      (bobClient.send as jest.Mock).mockClear();

      // Simulate what RoomService.kickUser does: remove from WS room + send MEMBER_KICKED
      // The real kickUserFromRoom iterates room members, sends MEMBER_KICKED, then leaveRoom
      const roomKey = '1';
      const room = roomService.manager.getRoom(roomKey);
      expect(room).toBeDefined();

      // Find Bob's connection and kick him (simulating kickUserFromRoom)
      for (const [connId, identity] of room!.members.entries()) {
        if (identity.userId === bobIdentity.userId) {
          roomService.manager.leaveRoom(roomKey, connId);
          const tracked = connectionService.getTrackedById(connId);
          if (tracked) {
            tracked.ws.send(
              JSON.stringify({
                event: WS_EMIT.MEMBER_KICKED,
                data: { roomId: 1, userId: bobIdentity.userId },
              }),
            );
          }
        }
      }

      // Bob should have received MEMBER_KICKED
      const bobMessages = parseSentMessages(bobClient);
      const kickedMsg = bobMessages.find((m: any) => m.event === WS_EMIT.MEMBER_KICKED);
      expect(kickedMsg).toBeDefined();
      expect(kickedMsg.data.roomId).toBe(1);
      expect(kickedMsg.data.userId).toBe(bobIdentity.userId);

      // Bob should no longer be in the room
      const members = roomService.manager.getRoomMembers(roomKey);
      expect(members.find((m) => m.userId === bobIdentity.userId)).toBeUndefined();
    });

    it('should broadcast MEMBER_LEFT to remaining members after kick', async () => {
      const ownerClient = createMockClient();
      const bobClient = createMockClient();
      const charlieClient = createMockClient();
      connectionService.trackClient(ownerClient, aliceIdentity);
      connectionService.trackClient(bobClient, bobIdentity);
      connectionService.trackClient(charlieClient, charlieIdentity);

      await gateway.handleJoinRoom(ownerClient, { roomId: 1 });
      await gateway.handleJoinRoom(bobClient, { roomId: 1 });
      await gateway.handleJoinRoom(charlieClient, { roomId: 1 });

      (ownerClient.send as jest.Mock).mockClear();
      (charlieClient.send as jest.Mock).mockClear();

      // Kick Bob — simulate kickUserFromRoom then broadcastToRoom
      const roomKey = '1';
      for (const [connId, identity] of roomService.manager.getRoom(roomKey)!.members.entries()) {
        if (identity.userId === bobIdentity.userId) {
          roomService.manager.leaveRoom(roomKey, connId);
          break;
        }
      }
      roomService.broadcastToRoom(roomKey, WS_EMIT.MEMBER_LEFT, {
        roomId: 1,
        member: { userId: bobIdentity.userId, username: 'bob', displayName: 'Bob' },
      });

      // Owner and Charlie should receive MEMBER_LEFT
      const ownerMessages = parseSentMessages(ownerClient);
      expect(ownerMessages.some((m: any) => m.event === WS_EMIT.MEMBER_LEFT)).toBe(true);

      const charlieMessages = parseSentMessages(charlieClient);
      expect(charlieMessages.some((m: any) => m.event === WS_EMIT.MEMBER_LEFT)).toBe(true);
    });
  });

  describe('ban flow', () => {
    it('should remove banned user from WS room and broadcast roster update', async () => {
      const ownerClient = createMockClient();
      const bobClient = createMockClient();
      connectionService.trackClient(ownerClient, aliceIdentity);
      connectionService.trackClient(bobClient, bobIdentity);

      await gateway.handleJoinRoom(ownerClient, { roomId: 1 });
      await gateway.handleJoinRoom(bobClient, { roomId: 1 });

      (ownerClient.send as jest.Mock).mockClear();
      (bobClient.send as jest.Mock).mockClear();

      // Simulate what RoomService.banUser does:
      // 1. Remove from roster (broadcast ROSTER_UPDATED)
      // 2. Kick from WS room (send MEMBER_KICKED, broadcast MEMBER_LEFT)
      const roomKey = '1';

      // Step 1: Broadcast ROSTER_UPDATED (roster without Bob)
      const rosterWithoutBob: RosterState = { players: [], spectators: [], rotatePlayers: false };
      roomService.broadcastToRoom(roomKey, WS_EMIT.ROSTER_UPDATED, {
        roomId: 1,
        roster: rosterWithoutBob,
      });

      // Step 2: Kick Bob from WS
      for (const [connId, identity] of roomService.manager.getRoom(roomKey)!.members.entries()) {
        if (identity.userId === bobIdentity.userId) {
          roomService.manager.leaveRoom(roomKey, connId);
          const tracked = connectionService.getTrackedById(connId);
          if (tracked) {
            tracked.ws.send(
              JSON.stringify({
                event: WS_EMIT.MEMBER_KICKED,
                data: { roomId: 1, userId: bobIdentity.userId },
              }),
            );
          }
          break;
        }
      }

      // Bob should have received ROSTER_UPDATED (before kick) and MEMBER_KICKED
      const bobMessages = parseSentMessages(bobClient);
      expect(bobMessages.some((m: any) => m.event === WS_EMIT.ROSTER_UPDATED)).toBe(true);
      expect(bobMessages.some((m: any) => m.event === WS_EMIT.MEMBER_KICKED)).toBe(true);

      // Owner should have received ROSTER_UPDATED
      const ownerMessages = parseSentMessages(ownerClient);
      expect(ownerMessages.some((m: any) => m.event === WS_EMIT.ROSTER_UPDATED)).toBe(true);

      // Bob should no longer be in the room
      const members = roomService.manager.getRoomMembers(roomKey);
      expect(members.find((m) => m.userId === bobIdentity.userId)).toBeUndefined();
    });
  });

  describe('roster reorder broadcast', () => {
    it('should broadcast ROSTER_UPDATED to all clients via reorderRoster', async () => {
      const reorderedRoster: RosterState = {
        players: [
          {
            userId: 1,
            username: 'alice',
            displayName: 'Alice',
            section: 'players',
            position: 0,
            assignedHue: null,
          },
        ],
        spectators: [
          {
            userId: 2,
            username: 'bob',
            displayName: 'Bob',
            section: 'spectators',
            position: 0,
            assignedHue: null,
          },
        ],
        rotatePlayers: false,
      };

      // reorderRoster broadcasts ROSTER_UPDATED internally — mock it to simulate the broadcast
      (roomService.reorderRoster as jest.Mock).mockImplementation(async () => {
        roomService.broadcastToRoom('1', WS_EMIT.ROSTER_UPDATED, {
          roomId: 1,
          roster: reorderedRoster,
        });
        return reorderedRoster;
      });

      const ownerClient = createMockClient();
      const bobClient = createMockClient();
      connectionService.trackClient(ownerClient, aliceIdentity);
      connectionService.trackClient(bobClient, bobIdentity);

      await gateway.handleJoinRoom(ownerClient, { roomId: 1 });
      await gateway.handleJoinRoom(bobClient, { roomId: 1 });

      (ownerClient.send as jest.Mock).mockClear();
      (bobClient.send as jest.Mock).mockClear();

      // Owner sends roster:update
      await gateway.handleRosterUpdate(ownerClient, {
        roomId: 1,
        players: [1],
        spectators: [2],
      });

      // Both clients should receive ROSTER_UPDATED
      const ownerMessages = parseSentMessages(ownerClient);
      const bobMessages = parseSentMessages(bobClient);

      expect(ownerMessages.some((m: any) => m.event === WS_EMIT.ROSTER_UPDATED)).toBe(true);
      expect(bobMessages.some((m: any) => m.event === WS_EMIT.ROSTER_UPDATED)).toBe(true);

      // Verify the roster payload
      const rosterMsg = bobMessages.find((m: any) => m.event === WS_EMIT.ROSTER_UPDATED);
      expect(rosterMsg.data.roster).toEqual(reorderedRoster);
    });

    it('should reject reorder from non-owner', async () => {
      (roomService.findById as jest.Mock).mockResolvedValue({
        id: 1,
        ownerId: aliceIdentity.userId,
      });

      const bobClient = createMockClient();
      connectionService.trackClient(bobClient, bobIdentity);

      await gateway.handleJoinRoom(bobClient, { roomId: 1 });
      (bobClient.send as jest.Mock).mockClear();

      await gateway.handleRosterUpdate(bobClient, {
        roomId: 1,
        players: [2],
        spectators: [1],
      });

      const messages = parseSentMessages(bobClient);
      expect(messages).toHaveLength(1);
      expect(messages[0].event).toBe(WS_EMIT.ERROR);
      expect(messages[0].data.message).toContain('Only the room owner');
    });
  });

  describe('handleGameSettingsUpdate', () => {
    const testSettings = {
      gameType: 'sheepshead',
      presetName: 'classic',
      config: { someField: 'value' },
      autostart: false,
    };

    it('should upsert settings and broadcast to room when sender is owner', async () => {
      const ownerClient = createMockClient();
      const bobClient = createMockClient();
      connectionService.trackClient(ownerClient, aliceIdentity);
      connectionService.trackClient(bobClient, bobIdentity);

      await gateway.handleJoinRoom(ownerClient, { roomId: 1 });
      await gateway.handleJoinRoom(bobClient, { roomId: 1 });

      (ownerClient.send as jest.Mock).mockClear();
      (bobClient.send as jest.Mock).mockClear();

      await gateway.handleGameSettingsUpdate(ownerClient, {
        roomId: 1,
        settings: testSettings,
      });

      expect(roomService.upsertGameSettings).toHaveBeenCalledWith(1, testSettings);

      // Both clients should receive the broadcast
      const ownerMessages = parseSentMessages(ownerClient);
      const bobMessages = parseSentMessages(bobClient);

      expect(ownerMessages.some((m: any) => m.event === WS_EMIT.GAME_SETTINGS_UPDATED)).toBe(true);
      expect(bobMessages.some((m: any) => m.event === WS_EMIT.GAME_SETTINGS_UPDATED)).toBe(true);

      const settingsMsg = bobMessages.find((m: any) => m.event === WS_EMIT.GAME_SETTINGS_UPDATED);
      expect(settingsMsg.data.settings).toEqual(testSettings);
    });

    it('should reject settings update from non-owner', async () => {
      const bobClient = createMockClient();
      connectionService.trackClient(bobClient, bobIdentity);

      await gateway.handleJoinRoom(bobClient, { roomId: 1 });
      (bobClient.send as jest.Mock).mockClear();

      await gateway.handleGameSettingsUpdate(bobClient, {
        roomId: 1,
        settings: testSettings,
      });

      expect(roomService.upsertGameSettings).not.toHaveBeenCalled();

      const messages = parseSentMessages(bobClient);
      expect(messages).toHaveLength(1);
      expect(messages[0].event).toBe(WS_EMIT.GAME_ERROR);
      expect(messages[0].data.message).toContain('Only the room owner');
    });

    it('should send error when upsert fails', async () => {
      (roomService.upsertGameSettings as jest.Mock).mockRejectedValue(new Error('DB error'));

      const ownerClient = createMockClient();
      connectionService.trackClient(ownerClient, aliceIdentity);

      await gateway.handleJoinRoom(ownerClient, { roomId: 1 });
      (ownerClient.send as jest.Mock).mockClear();

      await gateway.handleGameSettingsUpdate(ownerClient, {
        roomId: 1,
        settings: testSettings,
      });

      const messages = parseSentMessages(ownerClient);
      expect(messages).toHaveLength(1);
      expect(messages[0].event).toBe(WS_EMIT.GAME_ERROR);
      expect(messages[0].data.message).toContain('Failed to save game settings');
    });
  });

  describe('handleGameSettingsLoad', () => {
    it('should return persisted settings when they exist', async () => {
      const storedRow = {
        id: 1,
        roomId: 1,
        gameType: 'sheepshead',
        presetName: 'classic',
        config: { someField: 'value' },
        autostart: true,
        updatedAt: new Date(),
      };
      (roomService.loadGameSettings as jest.Mock).mockResolvedValue(storedRow);

      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleGameSettingsLoad(client, { roomId: 1 });

      const messages = parseSentMessages(client);
      expect(messages).toHaveLength(1);
      expect(messages[0].event).toBe(WS_EMIT.GAME_SETTINGS_LOADED);
      expect(messages[0].data.settings).toEqual({
        gameType: 'sheepshead',
        presetName: 'classic',
        config: { someField: 'value' },
        autostart: true,
      });
    });

    it('should return null settings when none exist', async () => {
      (roomService.loadGameSettings as jest.Mock).mockResolvedValue(null);

      const client = createMockClient();
      connectionService.trackClient(client, bobIdentity);

      await gateway.handleGameSettingsLoad(client, { roomId: 999 });

      const messages = parseSentMessages(client);
      expect(messages).toHaveLength(1);
      expect(messages[0].event).toBe(WS_EMIT.GAME_SETTINGS_LOADED);
      expect(messages[0].data.settings).toBeNull();
    });
  });
});

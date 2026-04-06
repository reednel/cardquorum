import * as fc from 'fast-check';
import { GameSessionRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { RosterState } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;
  let mockSessionRepo: jest.Mocked<
    Pick<GameSessionRepository, 'create' | 'updateStatusAndTimestamp' | 'updateStore'>
  >;
  let roomService: { manager: RoomManager; getRoster: jest.Mock; rotateSeat: jest.Mock };

  const aliceIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bobIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };
  const charlieIdentity = { userId: 3, username: 'charlie', displayName: 'Charlie' };

  // Minimal valid 3-player sheepshead config
  const validConfig = {
    name: '3-hand',
    playerCount: 3,
    handSize: 10,
    blindSize: 2,
    pickerRule: 'left-of-dealer' as const,
    partnerRule: null,
    noPick: 'leaster' as const,
    cracking: false,
    blitzing: false,
    doubleOnTheBump: false,
    partnerOffTheHook: false,
    noAceFaceTrump: false,
    multiplicityLimit: null,
    callOwnAce: null,
  };

  /** Helper to build a RosterState from player identities */
  function buildRoster(
    players: Array<{ userId: number; username: string; displayName: string }>,
    spectators: Array<{ userId: number; username: string; displayName: string }> = [],
  ): RosterState {
    return {
      players: players.map((p, i) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        section: 'players' as const,
        position: i,
      })),
      spectators: spectators.map((s, i) => ({
        userId: s.userId,
        username: s.username,
        displayName: s.displayName,
        section: 'spectators' as const,
        position: i,
      })),
      rotatePlayers: false,
    };
  }

  beforeEach(() => {
    mockSessionRepo = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateStatusAndTimestamp: jest.fn().mockResolvedValue({}),
      updateStore: jest.fn().mockResolvedValue({}),
    };

    const { RoomManager: RM } = jest.requireActual('@cardquorum/engine');
    roomService = {
      manager: new RM(),
      getRoster: jest.fn().mockResolvedValue(buildRoster([])),
      rotateSeat: jest.fn().mockResolvedValue(buildRoster([])),
    };

    service = new GameService(
      mockSessionRepo as unknown as GameSessionRepository,
      roomService as unknown as RoomService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('createSession', () => {
    it('should validate config, persist to DB, and return session info', async () => {
      const result = await service.createSession(1, 'sheepshead', validConfig, 10);

      expect(mockSessionRepo.create).toHaveBeenCalledWith({
        roomId: 1,
        gameType: 'sheepshead',
        config: validConfig,
      });
      expect(result).toEqual({
        sessionId: 1,
        gameType: 'sheepshead',
        config: validConfig,
      });
    });

    it('should throw for unknown game type', async () => {
      await expect(service.createSession(1, 'unknown-game', {}, 10)).rejects.toThrow(
        'Unknown game type: unknown-game',
      );
    });

    it('should throw for invalid config', async () => {
      await expect(service.createSession(1, 'sheepshead', { bad: 'config' }, 10)).rejects.toThrow(
        'Invalid game configuration',
      );
    });

    it('should throw if room already has an active game', async () => {
      await service.createSession(1, 'sheepshead', validConfig, 10);

      await expect(service.createSession(1, 'sheepshead', validConfig, 10)).rejects.toThrow(
        'Room 1 already has an active game session',
      );
    });
  });

  describe('startSession', () => {
    it('should initialize state and return per-player views', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.startSession(1, 1);

      expect(result.playerViews).toHaveLength(3);
      for (const [userID, view] of result.playerViews) {
        expect(typeof userID).toBe('number');
        expect(view).toBeDefined();
      }
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        1,
        'active',
        'startedAt',
      );
    });

    it('should throw if session does not exist', async () => {
      await expect(service.startSession(999, 1)).rejects.toThrow('Game session 999 not found');
    });

    it('should throw if sender is not the creator', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 2)).rejects.toThrow(
        'Only the session creator can start the game',
      );
    });

    it('should throw if session is already active', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Game session 1 is not in waiting status',
      );
    });

    it('should throw if player count does not match config', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.getRoster.mockResolvedValue(buildRoster([aliceIdentity, bobIdentity]));

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Expected 3 players, but Players list has 2',
      );
    });

    it('should throw if too many players in roster', async () => {
      const daveIdentity = { userId: 4, username: 'dave', displayName: 'Dave' };
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.manager.joinRoom('1', 'conn-4', daveIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity, daveIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Expected 3 players, but Players list has 4',
      );
    });

    it('should use only roster players, not spectators', async () => {
      const daveIdentity = { userId: 4, username: 'dave', displayName: 'Dave' };
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.manager.joinRoom('1', 'conn-4', daveIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity], [daveIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.startSession(1, 1);
      expect(result.playerViews).toHaveLength(3);
      const playerIds = result.playerViews.map(([id]) => id);
      expect(playerIds).toEqual([1, 2, 3]);
    });
  });

  describe('applyAction', () => {
    async function setupActiveGame(): Promise<number> {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);
      return 1;
    }

    it('should apply a valid deal action and return player views', async () => {
      const sessionId = await setupActiveGame();

      // Player 1 (dealer/activePlayer at userIDs[0]) deals
      const result = await service.applyAction(sessionId, 1, {
        type: 'deal',
      });

      expect(result.gameOver).toBe(false);
      expect(result.playerViews).toHaveLength(3);
      expect(result.store).toBeUndefined();
    });

    it('should throw for unknown session', async () => {
      await expect(service.applyAction(999, 1, { type: 'deal' })).rejects.toThrow(
        'Game session 999 not found',
      );
    });

    it('should throw if session is not active', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.applyAction(1, 1, { type: 'deal' })).rejects.toThrow(
        'Game session 1 is not active',
      );
    });

    it('should throw if user is not a player', async () => {
      const sessionId = await setupActiveGame();

      await expect(service.applyAction(sessionId, 99, { type: 'deal' })).rejects.toThrow(
        'User 99 is not a player in session 1',
      );
    });

    it('should throw if action is not valid for user', async () => {
      const sessionId = await setupActiveGame();

      // Player 2 is not the dealer (userIDs[0] = 1), cannot deal
      await expect(service.applyAction(sessionId, 2, { type: 'deal' })).rejects.toThrow(
        "Action 'deal' is not valid for user 2",
      );
    });
  });

  describe('getPlayerView', () => {
    it('should return the player view for an active session', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const view = service.getPlayerView(1, 1);
      expect(view).toBeDefined();
    });

    it('should return null if no active game for the room', () => {
      const view = service.getPlayerViewByRoom(99, 1);
      expect(view).toBeNull();
    });

    it('should return player view by roomId for reconnection', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const result = service.getPlayerViewByRoom(1, 1);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(1);
      expect(result!.state).toBeDefined();
    });

    it('should return null for a non-player', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const view = service.getPlayerView(1, 99);
      expect(view).toBeNull();
    });
  });

  describe('cancelSession', () => {
    it('should cancel a waiting session and clean up maps', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.cancelSession(1, 1);

      expect(result.roomId).toBe(1);
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        1,
        'cancelled',
        'finishedAt',
      );

      // Room is unblocked — can create a new session
      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      const newSession = await service.createSession(1, 'sheepshead', validConfig, 1);
      expect(newSession.sessionId).toBe(2);
    });

    it('should throw if session does not exist', async () => {
      await expect(service.cancelSession(999, 1)).rejects.toThrow('Game session 999 not found');
    });

    it('should abort an active session and clean up maps', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const result = await service.cancelSession(1, 1);

      expect(result.roomId).toBe(1);
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        1,
        'aborted',
        'finishedAt',
      );

      // Room is unblocked — can create a new session
      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      const newSession = await service.createSession(1, 'sheepshead', validConfig, 1);
      expect(newSession.sessionId).toBe(2);
    });

    it('should throw if requester is not the creator', async () => {
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.cancelSession(1, 2)).rejects.toThrow(
        'Only the session creator can cancel the game',
      );
    });
  });

  describe('cleanupDisconnectedCreator', () => {
    it('should cancel all waiting sessions created by the user', async () => {
      await service.createSession(1, 'sheepshead', validConfig, 1);
      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      await service.createSession(2, 'sheepshead', validConfig, 1);

      const cancelled = await service.cleanupDisconnectedCreator(1);

      expect(cancelled).toHaveLength(2);
      expect(cancelled.map((c) => c.roomId).sort()).toEqual([1, 2]);
    });

    it('should not cancel active sessions', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const cancelled = await service.cleanupDisconnectedCreator(1);
      expect(cancelled).toHaveLength(0);
    });

    it('should not cancel sessions created by other users', async () => {
      await service.createSession(1, 'sheepshead', validConfig, 2);

      const cancelled = await service.cleanupDisconnectedCreator(1);
      expect(cancelled).toHaveLength(0);
    });
  });

  describe('Game session uses exactly the players list', () => {
    // Generator for a unique identity with a given userId
    const identityArb = (userId: number) =>
      fc.record({
        userId: fc.constant(userId),
        username: fc.constant(`user${userId}`),
        displayName: fc.constant(`User ${userId}`),
      });

    // Generator for a list of exactly 3 unique user identities (matching sheepshead playerCount=3)
    const threePlayersArb = fc
      .uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 3, maxLength: 3 })
      .chain((ids) => fc.tuple(...ids.map((id) => identityArb(id))));

    // Generator for an arbitrary-length spectator list with IDs disjoint from a given set
    const spectatorsArb = (excludeIds: number[]) =>
      fc
        .uniqueArray(
          fc.integer({ min: 1, max: 10000 }).filter((id) => !excludeIds.includes(id)),
          { minLength: 0, maxLength: 5 },
        )
        .chain((ids) => fc.tuple(...ids.map((id) => identityArb(id))));

    it('should use exactly the player IDs from the roster in order', async () => {
      await fc.assert(
        fc.asyncProperty(
          threePlayersArb.chain((players) =>
            spectatorsArb(players.map((p) => p.userId)).map((spectators) => ({
              players,
              spectators,
            })),
          ),
          async ({ players, spectators }) => {
            // Fresh service per iteration to avoid "room already has active session"
            const freshService = new GameService(
              mockSessionRepo as unknown as GameSessionRepository,
              roomService as unknown as RoomService,
            );

            const roomId = 1;
            const creatorId = players[0].userId;

            // Join all users to the room manager so isUserInRoom passes
            for (const p of players) {
              roomService.manager.joinRoom(String(roomId), `conn-${p.userId}`, p);
            }
            for (const s of spectators) {
              roomService.manager.joinRoom(String(roomId), `conn-${s.userId}`, s);
            }

            roomService.getRoster.mockResolvedValue(buildRoster(players, spectators));
            mockSessionRepo.create.mockResolvedValue({ id: 1 } as any);

            await freshService.createSession(roomId, 'sheepshead', validConfig, creatorId);
            const result = await freshService.startSession(1, creatorId);

            // playerViews should contain exactly the player IDs, in roster order
            const viewIds = result.playerViews.map(([id]) => id);
            expect(viewIds).toEqual(players.map((p) => p.userId));

            // No spectator IDs should appear
            for (const s of spectators) {
              expect(viewIds).not.toContain(s.userId);
            }

            // Cleanup for next iteration
            freshService.onModuleDestroy();
            for (const p of players) {
              roomService.manager.leaveRoom(String(roomId), `conn-${p.userId}`);
            }
            for (const s of spectators) {
              roomService.manager.leaveRoom(String(roomId), `conn-${s.userId}`);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should reject when player count does not match config', async () => {
      // Generate player lists with length != 3 (the sheepshead playerCount)
      const wrongCountPlayersArb = fc
        .uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 10 })
        .filter((ids) => ids.length !== 3)
        .chain((ids) => fc.tuple(...(ids.length > 0 ? ids.map((id) => identityArb(id)) : [])));

      await fc.assert(
        fc.asyncProperty(wrongCountPlayersArb, async (players) => {
          const freshService = new GameService(
            mockSessionRepo as unknown as GameSessionRepository,
            roomService as unknown as RoomService,
          );

          const roomId = 1;
          // Use a fixed creator that's always in the room
          const creatorIdentity = { userId: 99999, username: 'creator', displayName: 'Creator' };
          roomService.manager.joinRoom(String(roomId), 'conn-creator', creatorIdentity);

          // Join generated players to the room too
          for (const p of players) {
            roomService.manager.joinRoom(String(roomId), `conn-${p.userId}`, p);
          }

          roomService.getRoster.mockResolvedValue(buildRoster(players));
          mockSessionRepo.create.mockResolvedValue({ id: 1 } as any);

          await freshService.createSession(
            roomId,
            'sheepshead',
            validConfig,
            creatorIdentity.userId,
          );

          await expect(freshService.startSession(1, creatorIdentity.userId)).rejects.toThrow(
            `Expected 3 players, but Players list has ${players.length}`,
          );

          freshService.onModuleDestroy();
          roomService.manager.leaveRoom(String(roomId), 'conn-creator');
          for (const p of players) {
            roomService.manager.leaveRoom(String(roomId), `conn-${p.userId}`);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});

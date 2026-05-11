import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fc from 'fast-check';
import {
  GameEventRepository,
  GameParticipantRepository,
  GameSessionRepository,
  UserRepository,
} from '@cardquorum/db';
import { ReplayService } from './replay.service';

describe('Session status access control', () => {
  const TERMINAL_STATUSES = ['finished', 'abandoned', 'cancelled', 'aborted'] as const;
  const NON_TERMINAL_STATUSES = ['waiting', 'active'] as const;
  const ALL_STATUSES = [...TERMINAL_STATUSES, ...NON_TERMINAL_STATUSES] as const;

  const terminalStatusArb = fc.constantFrom(...TERMINAL_STATUSES);
  const nonTerminalStatusArb = fc.constantFrom(...NON_TERMINAL_STATUSES);
  const allStatusArb = fc.constantFrom(...ALL_STATUSES);

  function buildService(sessionStatus: string, userId: number) {
    const mockSessionRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 1,
        gameType: 'sheepshead',
        config: {},
        status: sessionStatus,
        startedAt: new Date(),
        finishedAt: sessionStatus === 'finished' ? new Date() : null,
      }),
    } as unknown as GameSessionRepository;

    const mockParticipantRepo = {
      findBySessionId: jest.fn().mockResolvedValue([
        { userId, seatIndex: 0, sessionId: 1 },
        { userId: userId + 1, seatIndex: 1, sessionId: 1 },
        { userId: userId + 2, seatIndex: 2, sessionId: 1 },
      ]),
    } as unknown as GameParticipantRepository;

    const mockEventRepo = {
      findBySessionId: jest.fn().mockResolvedValue([
        {
          eventType: 'game_started',
          userId: null,
          payload: { colorMap: {} },
          message: null,
          seq: 0,
          createdAt: new Date(),
        },
      ]),
    } as unknown as GameEventRepository;

    const mockUserRepo = {
      findById: jest.fn().mockResolvedValue({
        id: userId,
        username: `user_${userId}`,
        displayName: `User ${userId}`,
      }),
    } as unknown as UserRepository;

    return new ReplayService(mockSessionRepo, mockEventRepo, mockParticipantRepo, mockUserRepo);
  }

  it('should allow access for terminal session statuses when user is a participant', () => {
    fc.assert(
      fc.asyncProperty(
        terminalStatusArb,
        fc.integer({ min: 1, max: 10000 }),
        async (status, userId) => {
          const service = buildService(status, userId);
          const result = await service.getReplayData(1, userId);
          expect(result).toBeDefined();
          expect(result.sessionId).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject access with ForbiddenException for non-terminal session statuses', () => {
    fc.assert(
      fc.asyncProperty(
        nonTerminalStatusArb,
        fc.integer({ min: 1, max: 10000 }),
        async (status, userId) => {
          const service = buildService(status, userId);
          await expect(service.getReplayData(1, userId)).rejects.toThrow(ForbiddenException);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should partition all statuses into exactly allow or deny', () => {
    fc.assert(
      fc.asyncProperty(allStatusArb, fc.integer({ min: 1, max: 10000 }), async (status, userId) => {
        const service = buildService(status, userId);
        const isTerminal = TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number]);

        if (isTerminal) {
          const result = await service.getReplayData(1, userId);
          expect(result).toBeDefined();
        } else {
          await expect(service.getReplayData(1, userId)).rejects.toThrow(ForbiddenException);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should reject with NotFoundException when session does not exist', () => {
    const mockSessionRepo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as GameSessionRepository;

    const mockParticipantRepo = {} as unknown as GameParticipantRepository;
    const mockEventRepo = {} as unknown as GameEventRepository;
    const mockUserRepo = {} as unknown as UserRepository;

    const service = new ReplayService(
      mockSessionRepo,
      mockEventRepo,
      mockParticipantRepo,
      mockUserRepo,
    );

    fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10000 }), async (userId) => {
        await expect(service.getReplayData(999, userId)).rejects.toThrow(NotFoundException);
      }),
      { numRuns: 100 },
    );
  });
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  type GameParticipantRepository,
  type GameSessionRepository,
  type UserRepository,
} from '@cardquorum/db';
import { SummaryService } from './summary.service';

describe('SummaryService', () => {
  let service: SummaryService;
  let mockSessionRepo: { findById: jest.Mock };
  let mockParticipantRepo: { findBySessionId: jest.Mock };
  let mockUserRepo: { findById: jest.Mock };

  const sessionId = 42;
  const userId = 10;
  const otherUserId = 99;

  const terminalSession = {
    id: sessionId,
    gameType: 'sheepshead',
    config: { playerCount: 3 },
    store: { tricks: [], players: [] },
    status: 'finished',
    startedAt: new Date(),
    finishedAt: new Date(),
  };

  const participants = [
    { userId: 10, seatIndex: 0, sessionId },
    { userId: 11, seatIndex: 1, sessionId },
    { userId: 12, seatIndex: 2, sessionId },
  ];

  beforeEach(() => {
    mockSessionRepo = { findById: jest.fn() };
    mockParticipantRepo = { findBySessionId: jest.fn() };
    mockUserRepo = { findById: jest.fn() };

    service = new SummaryService(
      mockSessionRepo as unknown as GameSessionRepository,
      mockParticipantRepo as unknown as GameParticipantRepository,
      mockUserRepo as unknown as UserRepository,
    );
  });

  describe('getSummaryData', () => {
    it('should throw NotFoundException when session does not exist', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      await expect(service.getSummaryData(sessionId, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when session is active (non-terminal)', async () => {
      mockSessionRepo.findById.mockResolvedValue({ ...terminalSession, status: 'active' });

      await expect(service.getSummaryData(sessionId, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when session is in playing status', async () => {
      mockSessionRepo.findById.mockResolvedValue({ ...terminalSession, status: 'playing' });

      await expect(service.getSummaryData(sessionId, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when requesting user is not a participant', async () => {
      mockSessionRepo.findById.mockResolvedValue(terminalSession);
      mockParticipantRepo.findBySessionId.mockResolvedValue(participants);

      await expect(service.getSummaryData(sessionId, otherUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return correct response shape for valid participant request', async () => {
      mockSessionRepo.findById.mockResolvedValue(terminalSession);
      mockParticipantRepo.findBySessionId.mockResolvedValue(participants);
      mockUserRepo.findById.mockImplementation((id: number) =>
        Promise.resolve({
          id,
          username: `user_${id}`,
          displayName: `User ${id}`,
        }),
      );

      const result = await service.getSummaryData(sessionId, userId);

      expect(result.sessionId).toBe(sessionId);
      expect(result.gameType).toBe('sheepshead');
      expect(result.store).toEqual(terminalSession.store);
      expect(result.participants).toHaveLength(3);
      expect(result.participants[0]).toEqual({
        userId: 10,
        displayName: 'User 10',
        username: 'user_10',
        seatIndex: 0,
      });
    });

    it('should allow access for all terminal statuses', async () => {
      const terminalStatuses = ['finished', 'abandoned', 'cancelled', 'aborted'];

      for (const status of terminalStatuses) {
        mockSessionRepo.findById.mockResolvedValue({ ...terminalSession, status });
        mockParticipantRepo.findBySessionId.mockResolvedValue(participants);
        mockUserRepo.findById.mockImplementation((id: number) =>
          Promise.resolve({ id, username: `user_${id}`, displayName: `User ${id}` }),
        );

        const result = await service.getSummaryData(sessionId, userId);
        expect(result.sessionId).toBe(sessionId);
      }
    });

    it('should use fallback display name when user has no displayName', async () => {
      mockSessionRepo.findById.mockResolvedValue(terminalSession);
      mockParticipantRepo.findBySessionId.mockResolvedValue([participants[0]]);
      mockUserRepo.findById.mockResolvedValue({
        id: 10,
        username: 'alice',
        displayName: null,
      });

      const result = await service.getSummaryData(sessionId, userId);

      expect(result.participants[0].displayName).toBe('alice');
    });

    it('should use fallback values when user record is not found', async () => {
      mockSessionRepo.findById.mockResolvedValue(terminalSession);
      mockParticipantRepo.findBySessionId.mockResolvedValue([participants[0]]);
      mockUserRepo.findById.mockResolvedValue(null);

      const result = await service.getSummaryData(sessionId, userId);

      expect(result.participants[0].displayName).toBe('User 10');
      expect(result.participants[0].username).toBe('user_10');
    });
  });
});

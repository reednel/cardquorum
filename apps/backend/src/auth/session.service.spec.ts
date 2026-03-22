import { SessionRepository } from '@cardquorum/db';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let sessionRepo: jest.Mocked<
    Pick<SessionRepository, 'create' | 'findValidSession' | 'deleteById' | 'deleteAllByUserId'>
  >;

  beforeEach(() => {
    sessionRepo = {
      create: jest.fn(),
      findValidSession: jest.fn(),
      deleteById: jest.fn(),
      deleteAllByUserId: jest.fn(),
    };
    service = new SessionService(sessionRepo as unknown as SessionRepository);
  });

  describe('createSession', () => {
    it('should generate a random ID and create a session', async () => {
      sessionRepo.create.mockResolvedValue({
        id: 'generated',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const sessionId = await service.createSession(1);

      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      expect(sessionRepo.create).toHaveBeenCalledWith(sessionId, 1);
    });
  });

  describe('validateSession', () => {
    it('should return identity for valid session', async () => {
      sessionRepo.findValidSession.mockResolvedValue({ userId: 1, displayName: 'Alice' });

      const result = await service.validateSession('abc');
      expect(result).toEqual({ userId: 1, displayName: 'Alice' });
    });

    it('should return null for invalid session', async () => {
      sessionRepo.findValidSession.mockResolvedValue(null);

      const result = await service.validateSession('bad');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete the session', async () => {
      sessionRepo.deleteById.mockResolvedValue({ id: 'abc' });
      await service.deleteSession('abc');
      expect(sessionRepo.deleteById).toHaveBeenCalledWith('abc');
    });
  });

  describe('deleteAllUserSessions', () => {
    it('should delete all sessions for a user', async () => {
      sessionRepo.deleteAllByUserId.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      await service.deleteAllUserSessions(1);
      expect(sessionRepo.deleteAllByUserId).toHaveBeenCalledWith(1);
    });
  });
});

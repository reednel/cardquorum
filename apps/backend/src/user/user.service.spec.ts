import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let mockUserRepo: {
    findById: jest.Mock;
    updateDisplayName: jest.Mock;
    searchByUsername: jest.Mock;
  };

  const now = new Date();
  const user = {
    id: 1,
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      updateDisplayName: jest.fn(),
      searchByUsername: jest.fn(),
    };

    service = new UserService(mockUserRepo as any);
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      mockUserRepo.findById.mockResolvedValue(user);

      const result = await service.getProfile(1);

      expect(result).toEqual({
        userId: 1,
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        createdAt: now.toISOString(),
      });
    });

    it('should return null when user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      const result = await service.getProfile(999);

      expect(result).toBeNull();
    });
  });

  describe('updateDisplayName', () => {
    it('should trim and update display name', async () => {
      const updated = { ...user, displayName: 'Alicia' };
      mockUserRepo.updateDisplayName.mockResolvedValue(updated);

      const result = await service.updateDisplayName(1, '  Alicia  ');

      expect(mockUserRepo.updateDisplayName).toHaveBeenCalledWith(1, 'Alicia');
      expect(result).toBeTruthy();
    });

    it('should throw on blank-after-trim input', async () => {
      await expect(service.updateDisplayName(1, '   ')).rejects.toThrow();
    });

    it('should throw on too-long input after trim', async () => {
      const longName = 'a'.repeat(51);
      await expect(service.updateDisplayName(1, longName)).rejects.toThrow();
    });
  });

  describe('searchUsers', () => {
    it('should return search results', async () => {
      const results = [{ id: 2, username: 'bob', displayName: 'Bob' }];
      mockUserRepo.searchByUsername.mockResolvedValue(results);

      const result = await service.searchUsers('bo', 1);

      expect(result).toEqual([{ userId: 2, username: 'bob', displayName: 'Bob' }]);
      expect(mockUserRepo.searchByUsername).toHaveBeenCalledWith('bo', 1, 20);
    });
  });
});

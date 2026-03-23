import { FriendService } from './friend.service';

describe('FriendService', () => {
  let service: FriendService;
  let mockFriendshipRepo: {
    create: jest.Mock;
    findById: jest.Mock;
    findBetweenUsers: jest.Mock;
    findFriends: jest.Mock;
    findIncomingRequests: jest.Mock;
    findOutgoingRequests: jest.Mock;
    accept: jest.Mock;
    deleteById: jest.Mock;
    areFriends: jest.Mock;
    findFriendIds: jest.Mock;
  };
  let mockUserRepo: {
    findById: jest.Mock;
  };

  const now = new Date();
  const pendingFriendship = {
    id: 1,
    requesterId: 10,
    addresseeId: 20,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    mockFriendshipRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findBetweenUsers: jest.fn(),
      findFriends: jest.fn(),
      findIncomingRequests: jest.fn(),
      findOutgoingRequests: jest.fn(),
      accept: jest.fn(),
      deleteById: jest.fn(),
      areFriends: jest.fn(),
      findFriendIds: jest.fn(),
    };
    mockUserRepo = {
      findById: jest.fn(),
    };

    service = new FriendService(mockFriendshipRepo as any, mockUserRepo as any);
  });

  describe('sendRequest', () => {
    it('should create a pending friendship', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20, username: 'bob', displayName: 'Bob' });
      mockFriendshipRepo.findBetweenUsers.mockResolvedValue(null);
      mockFriendshipRepo.create.mockResolvedValue(pendingFriendship);

      const result = await service.sendRequest(10, 20);

      expect(result.friendshipId).toBe(1);
      expect(result.status).toBe('pending');
    });

    it('should throw 400 when targeting self', async () => {
      await expect(service.sendRequest(10, 10)).rejects.toThrow(
        'Cannot send a friend request to yourself',
      );
    });

    it('should throw 404 when target user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.sendRequest(10, 99)).rejects.toThrow();
    });

    it('should throw 409 when friendship already exists', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20 });
      mockFriendshipRepo.findBetweenUsers.mockResolvedValue(pendingFriendship);

      await expect(service.sendRequest(10, 20)).rejects.toThrow();
    });
  });

  describe('acceptRequest', () => {
    it('should accept a pending request addressed to the user', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(pendingFriendship);
      const accepted = { ...pendingFriendship, status: 'accepted' };
      mockFriendshipRepo.accept.mockResolvedValue(accepted);
      mockUserRepo.findById.mockResolvedValue({ id: 10, username: 'alice', displayName: 'Alice' });

      const result = await service.acceptRequest(20, 1);

      expect(result.status).toBe('accepted');
    });

    it('should throw 404 when friendship not found', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(null);

      await expect(service.acceptRequest(20, 999)).rejects.toThrow();
    });

    it('should throw 404 when friendship is not pending', async () => {
      mockFriendshipRepo.findById.mockResolvedValue({ ...pendingFriendship, status: 'accepted' });

      await expect(service.acceptRequest(20, 1)).rejects.toThrow();
    });

    it('should throw 403 when user is not the addressee', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(pendingFriendship);

      await expect(service.acceptRequest(10, 1)).rejects.toThrow();
    });
  });

  describe('deleteRequest', () => {
    it('should delete a pending request when user is a party', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(pendingFriendship);
      mockFriendshipRepo.deleteById.mockResolvedValue({ id: 1 });

      await service.deleteRequest(10, 1);

      expect(mockFriendshipRepo.deleteById).toHaveBeenCalledWith(1);
    });

    it('should throw 403 when user is not a party', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(pendingFriendship);

      await expect(service.deleteRequest(99, 1)).rejects.toThrow();
    });

    it('should throw 404 when friendship not found', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(null);

      await expect(service.deleteRequest(10, 999)).rejects.toThrow();
    });

    it('should throw 404 when friendship is not pending', async () => {
      mockFriendshipRepo.findById.mockResolvedValue({ ...pendingFriendship, status: 'accepted' });

      await expect(service.deleteRequest(10, 1)).rejects.toThrow();
    });
  });

  describe('removeFriend', () => {
    it('should delete an accepted friendship when user is a party', async () => {
      const accepted = { ...pendingFriendship, status: 'accepted' };
      mockFriendshipRepo.findById.mockResolvedValue(accepted);
      mockFriendshipRepo.deleteById.mockResolvedValue({ id: 1 });

      await service.removeFriend(10, 1);

      expect(mockFriendshipRepo.deleteById).toHaveBeenCalledWith(1);
    });

    it('should throw 404 when friendship is not accepted', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(pendingFriendship);

      await expect(service.removeFriend(10, 1)).rejects.toThrow();
    });

    it('should throw 403 when user is not a party', async () => {
      const accepted = { ...pendingFriendship, status: 'accepted' };
      mockFriendshipRepo.findById.mockResolvedValue(accepted);

      await expect(service.removeFriend(99, 1)).rejects.toThrow();
    });
  });

  describe('listFriends', () => {
    it('should return formatted friend list', async () => {
      mockFriendshipRepo.findFriends.mockResolvedValue([
        {
          id: 1,
          status: 'accepted',
          createdAt: now,
          otherUserId: 20,
          otherUsername: 'bob',
          otherDisplayName: 'Bob',
        },
      ]);

      const result = await service.listFriends(10);

      expect(result).toEqual([
        {
          friendshipId: 1,
          user: { userId: 20, username: 'bob', displayName: 'Bob' },
          status: 'accepted',
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('listIncomingRequests', () => {
    it('should return formatted incoming requests', async () => {
      mockFriendshipRepo.findIncomingRequests.mockResolvedValue([
        {
          id: 1,
          status: 'pending',
          createdAt: now,
          otherUserId: 10,
          otherUsername: 'alice',
          otherDisplayName: 'Alice',
        },
      ]);

      const result = await service.listIncomingRequests(20);

      expect(result).toEqual([
        {
          friendshipId: 1,
          user: { userId: 10, username: 'alice', displayName: 'Alice' },
          status: 'pending',
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('listOutgoingRequests', () => {
    it('should return formatted outgoing requests', async () => {
      mockFriendshipRepo.findOutgoingRequests.mockResolvedValue([
        {
          id: 1,
          status: 'pending',
          createdAt: now,
          otherUserId: 20,
          otherUsername: 'bob',
          otherDisplayName: 'Bob',
        },
      ]);

      const result = await service.listOutgoingRequests(10);

      expect(result).toEqual([
        {
          friendshipId: 1,
          user: { userId: 20, username: 'bob', displayName: 'Bob' },
          status: 'pending',
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('areFriends', () => {
    it('should delegate to repository', async () => {
      mockFriendshipRepo.areFriends.mockResolvedValue(true);

      const result = await service.areFriends(10, 20);

      expect(result).toBe(true);
    });
  });
});

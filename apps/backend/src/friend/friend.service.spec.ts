import { FriendService } from './friend.service';

describe('FriendService', () => {
  let service: FriendService;
  let mockFriendshipRepo: {
    create: jest.Mock;
    findById: jest.Mock;
    findBetweenUsers: jest.Mock;
    findFriends: jest.Mock;
    deleteById: jest.Mock;
    areFriends: jest.Mock;
    findFriendIds: jest.Mock;
  };
  let mockFriendshipRequestRepo: {
    create: jest.Mock;
    findById: jest.Mock;
    findBetweenUsers: jest.Mock;
    findIncomingRequests: jest.Mock;
    findOutgoingRequests: jest.Mock;
    deleteById: jest.Mock;
  };
  let mockUserRepo: {
    findById: jest.Mock;
  };

  const now = new Date();
  const friendRequest = {
    id: 1,
    requesterId: 10,
    addresseeId: 20,
    createdAt: now,
  };
  const friendship = {
    id: 5,
    userId1: 10,
    userId2: 20,
    createdAt: now,
  };

  beforeEach(() => {
    mockFriendshipRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findBetweenUsers: jest.fn(),
      findFriends: jest.fn(),
      deleteById: jest.fn(),
      areFriends: jest.fn(),
      findFriendIds: jest.fn(),
    };
    mockFriendshipRequestRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findBetweenUsers: jest.fn(),
      findIncomingRequests: jest.fn(),
      findOutgoingRequests: jest.fn(),
      deleteById: jest.fn(),
    };
    mockUserRepo = {
      findById: jest.fn(),
    };

    service = new FriendService(
      mockFriendshipRepo as any,
      mockFriendshipRequestRepo as any,
      mockUserRepo as any,
    );
  });

  describe('sendRequest', () => {
    it('should create a friend request', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20, username: 'bob', displayName: 'Bob' });
      mockFriendshipRepo.findBetweenUsers.mockResolvedValue(null);
      mockFriendshipRequestRepo.findBetweenUsers.mockResolvedValue(null);
      mockFriendshipRequestRepo.create.mockResolvedValue(friendRequest);

      const result = await service.sendRequest(10, 20);

      expect(result.requestId).toBe(1);
      expect(result.user.username).toBe('bob');
      expect(mockFriendshipRequestRepo.create).toHaveBeenCalledWith(10, 20);
    });

    it('should throw 400 when targeting self', async () => {
      await expect(service.sendRequest(10, 10)).rejects.toThrow(
        'Cannot send a friend request to yourself',
      );
    });

    it('should throw 404 when target user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.sendRequest(10, 99)).rejects.toThrow('User not found');
    });

    it('should throw 409 when already friends', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20 });
      mockFriendshipRepo.findBetweenUsers.mockResolvedValue(friendship);

      await expect(service.sendRequest(10, 20)).rejects.toThrow('Already friends with this user');
    });

    it('should throw 409 when request already exists', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20 });
      mockFriendshipRepo.findBetweenUsers.mockResolvedValue(null);
      mockFriendshipRequestRepo.findBetweenUsers.mockResolvedValue(friendRequest);

      await expect(service.sendRequest(10, 20)).rejects.toThrow(
        'A friend request already exists with this user',
      );
    });
  });

  describe('acceptRequest', () => {
    it('should delete request and create friendship', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(friendRequest);
      mockFriendshipRequestRepo.deleteById.mockResolvedValue({ id: 1 });
      mockFriendshipRepo.create.mockResolvedValue(friendship);
      mockUserRepo.findById.mockResolvedValue({ id: 10, username: 'alice', displayName: 'Alice' });

      const result = await service.acceptRequest(20, 1);

      expect(mockFriendshipRequestRepo.deleteById).toHaveBeenCalledWith(1);
      expect(mockFriendshipRepo.create).toHaveBeenCalledWith(10, 20);
      expect(result.friendshipId).toBe(5);
      expect(result.user.username).toBe('alice');
    });

    it('should throw 404 when request not found', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(null);

      await expect(service.acceptRequest(20, 999)).rejects.toThrow('Friend request not found');
    });

    it('should throw 403 when user is not the addressee', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(friendRequest);

      await expect(service.acceptRequest(10, 1)).rejects.toThrow(
        'Only the addressee can accept a friend request',
      );
    });
  });

  describe('deleteRequest', () => {
    it('should delete a request when user is requester', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(friendRequest);
      mockFriendshipRequestRepo.deleteById.mockResolvedValue({ id: 1 });

      await service.deleteRequest(10, 1);

      expect(mockFriendshipRequestRepo.deleteById).toHaveBeenCalledWith(1);
    });

    it('should delete a request when user is addressee', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(friendRequest);
      mockFriendshipRequestRepo.deleteById.mockResolvedValue({ id: 1 });

      await service.deleteRequest(20, 1);

      expect(mockFriendshipRequestRepo.deleteById).toHaveBeenCalledWith(1);
    });

    it('should throw 403 when user is not a party', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(friendRequest);

      await expect(service.deleteRequest(99, 1)).rejects.toThrow(
        'You are not a party to this friend request',
      );
    });

    it('should throw 404 when request not found', async () => {
      mockFriendshipRequestRepo.findById.mockResolvedValue(null);

      await expect(service.deleteRequest(10, 999)).rejects.toThrow('Friend request not found');
    });
  });

  describe('removeFriend', () => {
    it('should delete a friendship when user is a party', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(friendship);
      mockFriendshipRepo.deleteById.mockResolvedValue({ id: 5 });

      await service.removeFriend(10, 5);

      expect(mockFriendshipRepo.deleteById).toHaveBeenCalledWith(5);
    });

    it('should throw 404 when friendship not found', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(null);

      await expect(service.removeFriend(10, 999)).rejects.toThrow('Friendship not found');
    });

    it('should throw 403 when user is not a party', async () => {
      mockFriendshipRepo.findById.mockResolvedValue(friendship);

      await expect(service.removeFriend(99, 5)).rejects.toThrow(
        'You are not a party to this friendship',
      );
    });
  });

  describe('listFriends', () => {
    it('should return formatted friend list', async () => {
      mockFriendshipRepo.findFriends.mockResolvedValue([
        {
          id: 1,
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
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('listIncomingRequests', () => {
    it('should return formatted incoming requests', async () => {
      mockFriendshipRequestRepo.findIncomingRequests.mockResolvedValue([
        {
          id: 1,
          createdAt: now,
          otherUserId: 10,
          otherUsername: 'alice',
          otherDisplayName: 'Alice',
        },
      ]);

      const result = await service.listIncomingRequests(20);

      expect(result).toEqual([
        {
          requestId: 1,
          user: { userId: 10, username: 'alice', displayName: 'Alice' },
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('listOutgoingRequests', () => {
    it('should return formatted outgoing requests', async () => {
      mockFriendshipRequestRepo.findOutgoingRequests.mockResolvedValue([
        {
          id: 1,
          createdAt: now,
          otherUserId: 20,
          otherUsername: 'bob',
          otherDisplayName: 'Bob',
        },
      ]);

      const result = await service.listOutgoingRequests(10);

      expect(result).toEqual([
        {
          requestId: 1,
          user: { userId: 20, username: 'bob', displayName: 'Bob' },
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

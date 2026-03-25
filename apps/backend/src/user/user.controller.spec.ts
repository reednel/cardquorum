import { UnauthorizedException } from '@nestjs/common';
import { SessionIdentity } from '@cardquorum/shared';
import { REQUEST_SESSION_KEY } from '../auth/http-auth.guard';
import { RoomService } from '../room/room.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

const REQUEST_USER_KEY = 'user';

const alice: SessionIdentity = { userId: 1, displayName: 'Alice', authMethod: 'basic' };

function makeRequest(identity: SessionIdentity, sessionCreatedAt = new Date()): any {
  return {
    [REQUEST_USER_KEY]: identity,
    [REQUEST_SESSION_KEY]: { createdAt: sessionCreatedAt },
  };
}

function makeReply(): any {
  return { header: jest.fn().mockReturnThis() };
}

describe('UserController', () => {
  let controller: UserController;
  let userService: {
    deleteAccount: jest.Mock;
    getProfile: jest.Mock;
    updateDisplayName: jest.Mock;
    searchUsers: jest.Mock;
  };
  let roomService: {
    broadcastToRoom: jest.Mock;
    manager: { getRoom: jest.Mock; leaveRoom: jest.Mock };
  };
  let connectionService: { getClientsByUserId: jest.Mock };

  beforeEach(() => {
    userService = {
      deleteAccount: jest.fn(),
      getProfile: jest.fn(),
      updateDisplayName: jest.fn(),
      searchUsers: jest.fn(),
    };
    roomService = {
      broadcastToRoom: jest.fn(),
      manager: { getRoom: jest.fn().mockReturnValue(null), leaveRoom: jest.fn() },
    };
    connectionService = { getClientsByUserId: jest.fn().mockReturnValue([]) };

    controller = new UserController(
      userService as any,
      roomService as any,
      connectionService as any,
    );
  });

  describe('deleteAccount', () => {
    it('should delete account, broadcast room deletions, and close WS connections', async () => {
      userService.deleteAccount.mockResolvedValue({ ownedRoomIds: [10, 20] });
      const mockWs = { close: jest.fn() };
      connectionService.getClientsByUserId.mockReturnValue([{ ws: mockWs }]);
      roomService.manager.getRoom.mockReturnValue({ members: new Map([['conn-1', {}]]) });
      const reply = makeReply();

      const createdAt = new Date();
      await controller.deleteAccount(makeRequest(alice, createdAt), reply, { password: 'secret' });

      expect(userService.deleteAccount).toHaveBeenCalledWith(1, 'basic', createdAt, 'secret');
      expect(reply.header).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('cq_session=; '),
      );
      expect(roomService.broadcastToRoom).toHaveBeenCalledTimes(2);
      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Account deleted');
    });

    it('should handle no owned rooms', async () => {
      userService.deleteAccount.mockResolvedValue({ ownedRoomIds: [] });
      const reply = makeReply();

      await controller.deleteAccount(makeRequest(alice), reply, { password: 'secret' });

      expect(roomService.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should propagate UnauthorizedException from service', async () => {
      userService.deleteAccount.mockRejectedValue(new UnauthorizedException());
      const reply = makeReply();

      await expect(
        controller.deleteAccount(makeRequest(alice), reply, { password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

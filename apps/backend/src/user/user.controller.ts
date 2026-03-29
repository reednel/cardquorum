import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SessionIdentity, UserProfile, UserSearchResult, WS_EMIT } from '@cardquorum/shared';
import { buildClearSessionCookie } from '../auth/cookie';
import { HttpAuthGuard, REQUEST_SESSION_KEY, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { BlockService } from '../block/block.service';
import { RoomService } from '../room/room.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import {
  DeleteAccountDto,
  SearchUsersDto,
  UpdateDisplayNameDto,
  UpdateUsernameDto,
} from './user.dto';
import { UserService } from './user.service';

@UseGuards(HttpAuthGuard)
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly roomService: RoomService,
    private readonly connectionService: WsConnectionService,
    private readonly blockService: BlockService,
  ) {}

  @Get('me')
  async getProfile(@Req() request: FastifyRequest): Promise<UserProfile> {
    const user = (request as any)[REQUEST_USER_KEY] as SessionIdentity;
    const profile = await this.userService.getProfile(user.userId);
    if (!profile) {
      throw new NotFoundException('User not found');
    }
    return profile;
  }

  @Patch('me/username')
  async updateUsername(
    @Req() request: FastifyRequest,
    @Body() dto: UpdateUsernameDto,
  ): Promise<UserProfile> {
    const user = (request as any)[REQUEST_USER_KEY] as SessionIdentity;
    return this.userService.updateUsername(user.userId, dto.username);
  }

  @Patch('me/display-name')
  async updateDisplayName(
    @Req() request: FastifyRequest,
    @Body() dto: UpdateDisplayNameDto,
  ): Promise<UserProfile> {
    const user = (request as any)[REQUEST_USER_KEY] as SessionIdentity;
    return this.userService.updateDisplayName(user.userId, dto.displayName);
  }

  @Get('search')
  async search(
    @Req() request: FastifyRequest,
    @Query() query: SearchUsersDto,
  ): Promise<UserSearchResult[]> {
    const user = (request as any)[REQUEST_USER_KEY] as SessionIdentity;
    const blockedIds = await this.blockService.getBlockedIds(user.userId);
    return this.userService.searchUsers(query.q, user.userId, blockedIds);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteAccount(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY] as SessionIdentity;
    const sessionMeta = (request as any)[REQUEST_SESSION_KEY] as { createdAt: Date };
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const { ownedRoomIds } = await this.userService.deleteAccount(
      user.userId,
      user.authMethod,
      sessionMeta.createdAt,
      dto.password,
    );

    reply.header('Set-Cookie', buildClearSessionCookie(nodeEnv));

    // Best-effort post-commit: broadcast ROOM_DELETED to WS members and clean up in-memory state
    for (const roomId of ownedRoomIds) {
      try {
        const roomKey = String(roomId);
        const room = this.roomService.manager.getRoom(roomKey);
        if (room) {
          this.roomService.broadcastToRoom(roomKey, WS_EMIT.ROOM_DELETED, { roomId });
          for (const connId of [...room.members.keys()]) {
            this.roomService.manager.leaveRoom(roomKey, connId);
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to broadcast room deletion for room ${roomId}: ${err}`);
      }
    }

    // Best-effort: close active WebSocket connections
    const clients = this.connectionService.getClientsByUserId(user.userId);
    for (const client of clients) {
      try {
        client.ws.close(4001, 'Account deleted');
      } catch (err) {
        this.logger.warn(`Failed to close WS connection for user ${user.userId}: ${err}`);
      }
    }
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { FriendRequestResponse, FriendshipResponse, UserIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { BlockService } from '../block/block.service';
import { FriendRequestDto } from './friend.dto';
import { FriendService } from './friend.service';

@UseGuards(HttpAuthGuard)
@Controller('friends')
export class FriendController {
  constructor(
    private readonly friendService: FriendService,
    private readonly blockService: BlockService,
  ) {}

  @Get()
  async listFriends(@Req() request: FastifyRequest): Promise<FriendshipResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const [friends, blockedIds] = await Promise.all([
      this.friendService.listFriends(user.userId),
      this.blockService.getBlockedIds(user.userId),
    ]);
    const blockedSet = new Set(blockedIds);
    return friends.filter((f) => !blockedSet.has(f.user.userId));
  }

  @Post('requests')
  @HttpCode(201)
  async sendRequest(
    @Req() request: FastifyRequest,
    @Body() dto: FriendRequestDto,
  ): Promise<FriendRequestResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.sendRequest(user.userId, dto.userId);
  }

  @Get('requests/incoming')
  async listIncoming(@Req() request: FastifyRequest): Promise<FriendRequestResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const [requests, blockedIds] = await Promise.all([
      this.friendService.listIncomingRequests(user.userId),
      this.blockService.getBlockedIds(user.userId),
    ]);
    const blockedSet = new Set(blockedIds);
    return requests.filter((r) => !blockedSet.has(r.user.userId));
  }

  @Get('requests/outgoing')
  async listOutgoing(@Req() request: FastifyRequest): Promise<FriendRequestResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const [requests, blockedIds] = await Promise.all([
      this.friendService.listOutgoingRequests(user.userId),
      this.blockService.getBlockedIds(user.userId),
    ]);
    const blockedSet = new Set(blockedIds);
    return requests.filter((r) => !blockedSet.has(r.user.userId));
  }

  @Post('requests/:id/accept')
  async acceptRequest(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<FriendshipResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.acceptRequest(user.userId, id);
  }

  @Delete('requests/:id')
  @HttpCode(204)
  async deleteRequest(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.deleteRequest(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async removeFriend(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.removeFriend(user.userId, id);
  }
}

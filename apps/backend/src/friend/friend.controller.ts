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
import { FriendshipResponse, UserIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { FriendRequestDto } from './friend.dto';
import { FriendService } from './friend.service';

@UseGuards(HttpAuthGuard)
@Controller('friends')
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @Get()
  async listFriends(@Req() request: FastifyRequest): Promise<FriendshipResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.listFriends(user.userId);
  }

  @Post('requests')
  @HttpCode(201)
  async sendRequest(
    @Req() request: FastifyRequest,
    @Body() dto: FriendRequestDto,
  ): Promise<FriendshipResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.sendRequest(user.userId, dto.userId);
  }

  @Get('requests/incoming')
  async listIncoming(@Req() request: FastifyRequest): Promise<FriendshipResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.listIncomingRequests(user.userId);
  }

  @Get('requests/outgoing')
  async listOutgoing(@Req() request: FastifyRequest): Promise<FriendshipResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.friendService.listOutgoingRequests(user.userId);
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

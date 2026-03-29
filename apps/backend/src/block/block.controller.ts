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
import { BlockedUserResponse, UserIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { BlockUserDto } from './block.dto';
import { BlockService } from './block.service';

@UseGuards(HttpAuthGuard)
@Controller('blocks')
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  @Post()
  @HttpCode(201)
  async block(
    @Req() request: FastifyRequest,
    @Body() dto: BlockUserDto,
  ): Promise<BlockedUserResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.blockService.blockUser(user.userId, dto.userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async unblock(
    @Req() request: FastifyRequest,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.blockService.unblockUser(user.userId, userId);
  }

  @Get()
  async list(@Req() request: FastifyRequest): Promise<BlockedUserResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.blockService.getBlockList(user.userId);
  }
}

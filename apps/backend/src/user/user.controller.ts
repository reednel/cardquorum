import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UserIdentity, UserProfile, UserSearchResult } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { SearchUsersDto, UpdateDisplayNameDto } from './user.dto';
import { UserService } from './user.service';

@UseGuards(HttpAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getProfile(@Req() request: FastifyRequest): Promise<UserProfile> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const profile = await this.userService.getProfile(user.userId);
    if (!profile) {
      throw new NotFoundException('User not found');
    }
    return profile;
  }

  @Patch('me')
  async updateDisplayName(
    @Req() request: FastifyRequest,
    @Body() dto: UpdateDisplayNameDto,
  ): Promise<UserProfile> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.userService.updateDisplayName(user.userId, dto.displayName);
  }

  @Get('search')
  async search(
    @Req() request: FastifyRequest,
    @Query() query: SearchUsersDto,
  ): Promise<UserSearchResult[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.userService.searchUsers(query.q, user.userId);
  }
}

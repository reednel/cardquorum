import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RoomRosterRepository } from '@cardquorum/db';
import {
  RoomBanResponse,
  RoomInviteResponse,
  RoomResponse,
  RoomVisibility,
  RosterState,
  UserIdentity,
} from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { GameService } from '../game/game.service';
import {
  CreateRoomDto,
  RoomUserDto,
  ToggleRotateDto,
  UpdateRoomDto,
  UpdateRosterDto,
} from './room.dto';
import { RoomService } from './room.service';

@UseGuards(HttpAuthGuard)
@Controller('rooms')
export class RoomController {
  private readonly logger = new Logger(RoomController.name);

  constructor(
    private readonly roomService: RoomService,
    private readonly gameService: GameService,
    private readonly roomRosters: RoomRosterRepository,
  ) {}

  @Post()
  async create(@Req() request: FastifyRequest, @Body() dto: CreateRoomDto): Promise<RoomResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const visibility = dto.visibility ?? 'public';

    const row = await this.roomService.create(dto.name, user.userId, visibility, dto.memberLimit);

    if (dto.invitedUserIds?.length) {
      const filtered = dto.invitedUserIds.filter((id) => id !== user.userId);
      await this.roomService.bulkInvite(row.id, filtered);
    }

    return {
      id: row.id,
      name: row.name,
      ownerId: user.userId,
      ownerDisplayName: user.displayName,
      visibility: row.visibility as RoomVisibility,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      onlineCount: 0,
      memberLimit: row.memberLimit ?? null,
      rosterCount: 0,
      isOnRoster: false,
    };
  }

  @Get()
  async list(@Req() request: FastifyRequest): Promise<RoomResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const rooms = await this.roomService.findAllForUser(user.userId);

    const results: RoomResponse[] = [];
    for (const r of rooms) {
      const rosterCount = await this.roomRosters.countMembers(r.id);
      const isOnRoster = await this.roomRosters.isMember(r.id, user.userId);
      results.push({
        id: r.id,
        name: r.name,
        ownerId: r.ownerId,
        ownerDisplayName: r.ownerDisplayName,
        visibility: r.visibility as RoomVisibility,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        onlineCount: this.roomService.getOnlineCount(r.id),
        memberLimit: r.memberLimit ?? null,
        rosterCount,
        isOnRoster,
      });
    }
    return results;
  }

  @Get(':id')
  async findOne(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RoomResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const canAccess = await this.roomService.canAccessRoom(id, user.userId);
    if (!canAccess) {
      throw new NotFoundException(`Room ${id} not found`);
    }

    const room = (await this.roomService.findById(id))!;
    const rosterCount = await this.roomRosters.countMembers(room.id);
    const isOnRoster = await this.roomRosters.isMember(room.id, user.userId);

    return {
      id: room.id,
      name: room.name,
      ownerId: room.ownerId,
      ownerDisplayName: room.ownerDisplayName,
      visibility: room.visibility as RoomVisibility,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      onlineCount: this.roomService.getOnlineCount(room.id),
      memberLimit: room.memberLimit ?? null,
      rosterCount,
      isOnRoster,
    };
  }

  @Patch(':id')
  async update(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;

    const room = await this.roomService.findById(id);
    if (!room) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    if (room.ownerId !== user.userId) {
      throw new ForbiddenException('Only the room owner can update this room');
    }

    const fields: { name?: string; visibility?: string } = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.visibility !== undefined) fields.visibility = dto.visibility;

    const updated = await this.roomService.update(id, fields);
    if (!updated) {
      throw new NotFoundException(`Room ${id} not found`);
    }

    const rosterCount = await this.roomRosters.countMembers(updated.id);
    const isOnRoster = await this.roomRosters.isMember(updated.id, user.userId);

    return {
      id: updated.id,
      name: updated.name,
      ownerId: room.ownerId,
      ownerDisplayName: room.ownerDisplayName,
      visibility: updated.visibility as RoomVisibility,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      onlineCount: this.roomService.getOnlineCount(updated.id),
      memberLimit: room.memberLimit ?? null,
      rosterCount,
      isOnRoster,
    };
  }

  @Delete(':id')
  async remove(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ deleted: true }> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;

    const room = await this.roomService.findById(id);
    if (!room) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    if (room.ownerId !== user.userId) {
      throw new ForbiddenException('Only the room owner can delete this room');
    }

    await this.gameService.forceCleanupRoom(id);
    await this.roomService.delete(id);
    this.logger.log(`Room ${id} deleted by user ${user.userId}`);

    return { deleted: true };
  }

  // --- Invite endpoints ---

  @Get(':id/invites')
  async listInvites(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RoomInviteResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const canAccess = await this.roomService.canAccessRoom(id, user.userId);
    if (!canAccess) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return this.roomService.getInvites(id);
  }

  @Post(':id/invites')
  async invite(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RoomUserDto,
  ): Promise<{ success: true }> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    this.assertNotSelf(user.userId, dto.userId);
    await this.roomService.inviteUser(id, dto.userId);
    return { success: true };
  }

  @Delete(':id/invites/:userId')
  async uninvite(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<{ success: true }> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    this.assertNotSelf(user.userId, userId);
    await this.roomService.uninviteUser(id, userId);
    return { success: true };
  }

  // --- Kick endpoint ---

  @Post(':id/kick')
  async kick(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RoomUserDto,
  ): Promise<{ success: true }> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    this.assertNotSelf(user.userId, dto.userId);
    await this.roomService.kickUser(id, dto.userId);
    return { success: true };
  }

  // --- Ban endpoints ---

  @Get(':id/bans')
  async listBans(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RoomBanResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    return this.roomService.getBans(id);
  }

  @Post(':id/bans')
  async ban(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RoomUserDto,
  ): Promise<{ success: true }> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    this.assertNotSelf(user.userId, dto.userId);
    await this.roomService.banUser(id, dto.userId);
    return { success: true };
  }

  @Delete(':id/bans/:userId')
  async unban(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<{ success: true }> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    this.assertNotSelf(user.userId, userId);
    await this.roomService.unbanUser(id, userId);
    return { success: true };
  }

  // --- Roster endpoints ---

  @Get(':id/roster')
  async getRoster(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RosterState> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const canAccess = await this.roomService.canAccessRoom(id, user.userId);
    if (!canAccess) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return this.roomService.getRoster(id);
  }

  @Put(':id/roster')
  async updateRoster(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRosterDto,
  ): Promise<RosterState> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    const gameActive = this.gameService.isGameActive(id);
    return this.roomService.reorderRoster(id, dto.players, dto.spectators, { gameActive });
  }

  @Patch(':id/roster/rotate')
  async toggleRotate(
    @Req() request: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ToggleRotateDto,
  ): Promise<RosterState> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    await this.assertOwner(id, user.userId);
    return this.roomService.toggleRotatePlayers(id, dto.enabled);
  }

  // --- Helpers ---

  private async assertOwner(roomId: number, userId: number): Promise<void> {
    const room = await this.roomService.findById(roomId);
    if (!room) throw new NotFoundException(`Room ${roomId} not found`);
    if (room.ownerId !== userId) {
      throw new ForbiddenException('Only the room owner can perform this action');
    }
  }

  private assertNotSelf(ownerId: number, targetId: number): void {
    if (ownerId === targetId) {
      throw new BadRequestException('Cannot perform this action on yourself');
    }
  }
}

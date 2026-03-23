import {
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RoomResponse, RoomVisibility, UserIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { GameService } from '../game/game.service';
import { CreateRoomDto, UpdateRoomDto } from './room.dto';
import { RoomService } from './room.service';

@UseGuards(HttpAuthGuard)
@Controller('rooms')
export class RoomController {
  private readonly logger = new Logger(RoomController.name);

  constructor(
    private readonly roomService: RoomService,
    private readonly gameService: GameService,
  ) {}

  @Post()
  async create(@Req() request: FastifyRequest, @Body() dto: CreateRoomDto): Promise<RoomResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const visibility = dto.visibility ?? 'public';

    const row = await this.roomService.create(dto.name, user.userId, visibility);

    return {
      id: row.id,
      name: row.name,
      ownerId: user.userId,
      ownerDisplayName: user.displayName,
      visibility: row.visibility as RoomVisibility,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      onlineCount: 0,
    };
  }

  @Get()
  async list(@Req() request: FastifyRequest): Promise<RoomResponse[]> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    const rooms = await this.roomService.findAllForUser(user.userId);

    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.ownerId,
      ownerDisplayName: r.ownerDisplayName,
      visibility: r.visibility as RoomVisibility,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      onlineCount: this.roomService.getOnlineCount(r.id),
    }));
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

    return {
      id: room.id,
      name: room.name,
      ownerId: room.ownerId,
      ownerDisplayName: room.ownerDisplayName,
      visibility: room.visibility as RoomVisibility,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      onlineCount: this.roomService.getOnlineCount(room.id),
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

    return {
      id: updated.id,
      name: updated.name,
      ownerId: room.ownerId,
      ownerDisplayName: room.ownerDisplayName,
      visibility: updated.visibility as RoomVisibility,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      onlineCount: this.roomService.getOnlineCount(updated.id),
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

    // Clean up any active game session before deleting
    await this.gameService.forceCleanupRoom(id);

    await this.roomService.delete(id);
    this.logger.log(`Room ${id} deleted by user ${user.userId}`);

    return { deleted: true };
  }
}

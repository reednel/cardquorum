import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GameEventRepository,
  GameParticipantRepository,
  GameSessionRepository,
  UserRepository,
} from '@cardquorum/db';
import {
  type ReplayDataResponse,
  type ReplayEventDto,
  type ReplayParticipantDto,
  type ReplaySessionListResponse,
  type ReplaySessionSummary,
} from '@cardquorum/shared';

export interface SessionListOptions {
  statuses: string[];
  gameType?: string;
  cursor?: string;
  limit: number;
  sortDirection: 'asc' | 'desc';
}

const TERMINAL_STATUSES = ['finished', 'abandoned', 'cancelled', 'aborted'];

@Injectable()
export class ReplayService {
  constructor(
    private readonly sessionRepo: GameSessionRepository,
    private readonly eventRepo: GameEventRepository,
    private readonly participantRepo: GameParticipantRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async getReplayData(sessionId: number, userId: number): Promise<ReplayDataResponse> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!TERMINAL_STATUSES.includes(session.status)) {
      throw new ForbiddenException('Session is not available for replay');
    }

    const participants = await this.participantRepo.findBySessionId(sessionId);
    const isParticipant = participants.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    const events = await this.eventRepo.findBySessionId(sessionId);

    // Fetch display names for all participants
    const participantDtos: ReplayParticipantDto[] = await Promise.all(
      participants.map(async (p) => {
        const user = await this.userRepo.findById(p.userId);
        return {
          userId: p.userId,
          seatIndex: p.seatIndex,
          displayName: user?.displayName ?? user?.username ?? `User ${p.userId}`,
          username: user?.username ?? `user_${p.userId}`,
        };
      }),
    );

    // Extract colorMap from the game_started event payload
    let colorMap: Record<number, number> = {};
    const gameStartedEvent = events.find((e) => e.eventType === 'game_started');
    if (gameStartedEvent?.payload && typeof gameStartedEvent.payload === 'object') {
      const payload = gameStartedEvent.payload as Record<string, unknown>;
      if (payload.colorMap && typeof payload.colorMap === 'object') {
        colorMap = payload.colorMap as Record<number, number>;
      }
    }

    // Map events to DTOs
    const eventDtos: ReplayEventDto[] = events.map((e) => ({
      eventType: e.eventType,
      userId: e.userId,
      payload: e.payload,
      message: e.message,
      seq: e.seq,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      sessionId: session.id,
      gameType: session.gameType,
      config: session.config,
      status: session.status,
      startedAt: session.startedAt?.toISOString() ?? null,
      finishedAt: session.finishedAt?.toISOString() ?? null,
      colorMap,
      participants: participantDtos,
      events: eventDtos,
    };
  }

  async getGameHistory(
    userId: number,
    options: SessionListOptions,
  ): Promise<ReplaySessionListResponse> {
    const { sessions, nextCursor } = await this.sessionRepo.findByUserIdPaginated(userId, options);

    const sessionSummaries: ReplaySessionSummary[] = sessions.map((s) => ({
      sessionId: s.id,
      gameType: s.gameType,
      status: s.status,
      roomName: s.roomName ?? null,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
    }));

    return {
      sessions: sessionSummaries,
      nextCursor,
    };
  }
}

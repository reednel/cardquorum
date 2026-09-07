import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GameParticipantRepository, GameSessionRepository, UserRepository } from '@cardquorum/db';
import { type SummaryDataResponse, type SummaryParticipantDto } from '@cardquorum/shared';

const TERMINAL_STATUSES = ['finished', 'abandoned', 'cancelled', 'aborted'];

@Injectable()
export class SummaryService {
  constructor(
    private readonly sessionRepo: GameSessionRepository,
    private readonly participantRepo: GameParticipantRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async getSummaryData(sessionId: number, userId: number): Promise<SummaryDataResponse> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!TERMINAL_STATUSES.includes(session.status)) {
      throw new ForbiddenException('Session is not available for summary');
    }

    const participants = await this.participantRepo.findBySessionId(sessionId);
    const isParticipant = participants.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    const participantDtos: SummaryParticipantDto[] = await Promise.all(
      participants.map(async (p) => {
        const user = await this.userRepo.findById(p.userId);
        return {
          userId: p.userId,
          displayName: user?.displayName ?? user?.username ?? `User ${p.userId}`,
          username: user?.username ?? `user_${p.userId}`,
          seatIndex: p.seatIndex,
        };
      }),
    );

    return {
      sessionId: session.id,
      gameType: session.gameType,
      store: session.store,
      participants: participantDtos,
    };
  }
}

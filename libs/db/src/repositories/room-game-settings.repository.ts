import { eq } from 'drizzle-orm';
import { roomGameSettings } from '../schema';
import { DbInstance } from '../types';

export class RoomGameSettingsRepository {
  constructor(private readonly db: DbInstance) {}

  async findByRoomId(roomId: number) {
    const rows = await this.db
      .select()
      .from(roomGameSettings)
      .where(eq(roomGameSettings.roomId, roomId))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsert(
    roomId: number,
    settings: {
      gameType: string | null;
      presetName: string | null;
      config: Record<string, unknown>;
      autostart: boolean;
    },
  ) {
    const [row] = await this.db
      .insert(roomGameSettings)
      .values({
        roomId,
        gameType: settings.gameType,
        presetName: settings.presetName,
        config: settings.config,
        autostart: settings.autostart,
      })
      .onConflictDoUpdate({
        target: roomGameSettings.roomId,
        set: {
          gameType: settings.gameType,
          presetName: settings.presetName,
          config: settings.config,
          autostart: settings.autostart,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}

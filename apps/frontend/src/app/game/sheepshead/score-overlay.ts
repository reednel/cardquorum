import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { UserIdentity } from '@cardquorum/shared';

interface ScorePlayer {
  userID: number;
  role: string | null;
  scoreDelta: number | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-score-overlay',
  template: `
    <div class="flex w-80 flex-col items-center gap-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Game Over</h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 dark:border-gray-700">
            <th class="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Player</th>
            <th class="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Role</th>
            <th class="px-2 py-1 text-right font-medium text-gray-600 dark:text-gray-400">Score</th>
          </tr>
        </thead>
        <tbody>
          @for (player of players(); track player.userID) {
            <tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="px-2 py-1.5 text-gray-800 dark:text-gray-200">
                {{ displayName(player.userID) }}
              </td>
              <td class="px-2 py-1.5 capitalize text-gray-600 dark:text-gray-400">
                {{ player.role ?? '—' }}
              </td>
              <td
                [class]="
                  'px-2 py-1.5 text-right font-medium ' +
                  (player.scoreDelta !== null && player.scoreDelta > 0
                    ? 'text-green-600 dark:text-green-400'
                    : player.scoreDelta !== null && player.scoreDelta < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400')
                "
              >
                {{
                  player.scoreDelta !== null
                    ? (player.scoreDelta > 0 ? '+' : '') + player.scoreDelta
                    : '—'
                }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ScoreOverlay {
  readonly players = input.required<ScorePlayer[]>();
  readonly members = input.required<UserIdentity[]>();

  protected displayName(userID: number): string {
    const member = this.members().find((m) => m.userId === userID);
    return member?.displayName ?? member?.username ?? `Player ${userID}`;
  }
}

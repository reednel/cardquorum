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
      <h3 class="text-lg font-semibold text-text-heading dark:text-white">Game Over</h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border dark:border-border-dark">
            <th
              class="px-2 py-1 text-left font-medium text-text-secondary dark:text-text-secondary-dark"
            >
              Player
            </th>
            <th
              class="px-2 py-1 text-left font-medium text-text-secondary dark:text-text-secondary-dark"
            >
              Role
            </th>
            <th
              class="px-2 py-1 text-right font-medium text-text-secondary dark:text-text-secondary-dark"
            >
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          @for (player of players(); track player.userID) {
            <tr class="border-b border-surface-raised dark:border-border-dark/50">
              <td class="px-2 py-1.5 text-text-body dark:text-text-heading-dark">
                {{ displayName(player.userID) }}
              </td>
              <td class="px-2 py-1.5 capitalize text-text-secondary dark:text-text-secondary-dark">
                {{ player.role ?? '—' }}
              </td>
              <td
                [class]="
                  'px-2 py-1.5 text-right font-medium ' +
                  (player.scoreDelta !== null && player.scoreDelta > 0
                    ? 'text-success dark:text-success-light'
                    : player.scoreDelta !== null && player.scoreDelta < 0
                      ? 'text-danger dark:text-danger-light'
                      : 'text-text-secondary dark:text-text-secondary-dark')
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

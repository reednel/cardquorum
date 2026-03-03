import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-lobby',
  imports: [FormsModule],
  template: `
    <div class="flex items-center justify-center min-h-screen bg-gray-900">
      <form
        (ngSubmit)="joinRoom()"
        class="bg-gray-800 rounded-lg shadow-lg p-8 w-full max-w-sm flex flex-col gap-5"
      >
        <h1 class="text-2xl font-bold text-white text-center">Join a Chat Room</h1>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-300">Nickname</span>
          <input
            type="text"
            [(ngModel)]="nickname"
            name="nickname"
            required
            maxlength="30"
            class="rounded-md bg-gray-700 border border-gray-600 text-white px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Enter your nickname"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-300">Room ID</span>
          <input
            type="text"
            [(ngModel)]="roomId"
            name="roomId"
            required
            class="rounded-md bg-gray-700 border border-gray-600 text-white px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Enter a room ID (any UUID)"
          />
        </label>

        <button
          type="submit"
          [disabled]="!nickname() || !roomId()"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed
                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                 focus:ring-offset-gray-800 transition-colors"
        >
          Join Room
        </button>
      </form>
    </div>
  `,
})
export class ChatLobby {
  nickname = signal('');
  roomId = signal('');

  constructor(private readonly router: Router) {
    const saved = sessionStorage.getItem('chat_nickname');
    if (saved) this.nickname.set(saved);
  }

  joinRoom(): void {
    const nick = this.nickname().trim();
    const room = this.roomId().trim();
    if (!nick || !room) return;

    sessionStorage.setItem('chat_nickname', nick);
    this.router.navigate(['/chat', room]);
  }
}

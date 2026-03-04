import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
          <span class="text-sm font-medium text-gray-300">Display Name</span>
          <input
            type="text"
            [(ngModel)]="displayName"
            name="displayName"
            required
            maxlength="30"
            class="rounded-md bg-gray-700 border border-gray-600 text-white px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Enter your display name"
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
            placeholder="Enter a room ID (number)"
          />
        </label>

        <button
          type="submit"
          [disabled]="!displayName() || !roomId()"
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
  private readonly router = inject(Router);

  displayName = signal('');
  roomId = signal('');

  constructor() {
    const saved = sessionStorage.getItem('chat_display_name');
    if (saved) this.displayName.set(saved);
  }

  joinRoom(): void {
    const name = this.displayName().trim();
    const room = this.roomId().trim();
    if (!name || !room) return;

    const roomNum = parseInt(room, 10);
    if (isNaN(roomNum)) return;

    sessionStorage.setItem('chat_display_name', name);
    this.router.navigate(['/chat', roomNum]);
  }
}

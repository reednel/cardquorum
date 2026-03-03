import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'chat',
    loadComponent: () => import('./chat/chat-lobby').then((m) => m.ChatLobby),
  },
  {
    path: 'chat/:roomId',
    loadComponent: () => import('./chat/chat-room').then((m) => m.ChatRoom),
  },
  { path: '', redirectTo: 'chat', pathMatch: 'full' },
];

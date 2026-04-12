import { Route } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    title: 'Log in — CardQuorum',
    loadComponent: () => import('./auth/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Register — CardQuorum',
    loadComponent: () => import('./auth/register').then((m) => m.Register),
  },
  {
    path: 'register/oidc',
    title: 'Register — CardQuorum',
    loadComponent: () => import('./auth/register-oidc').then((m) => m.RegisterOidc),
  },
  {
    path: '',
    loadComponent: () => import('./shell/app-shell').then((m) => m.AppShell),
    canActivate: [authGuard],
    children: [
      {
        path: 'rooms',
        title: 'Rooms — CardQuorum',
        loadComponent: () => import('./room-listings/room-list').then((m) => m.RoomList),
      },
      {
        path: 'rooms/:roomId',
        title: 'Room — CardQuorum',
        loadComponent: () => import('./room/room-view').then((m) => m.RoomView),
      },
      {
        path: 'account',
        loadComponent: () => import('./account/account-shell').then((m) => m.AccountShell),
        children: [
          {
            path: '',
            title: 'Account — CardQuorum',
            loadComponent: () => import('./account/account-page').then((m) => m.AccountPage),
          },
          {
            path: 'friends',
            title: 'Friends — CardQuorum',
            loadComponent: () => import('./account/friends-page').then((m) => m.FriendsPage),
          },
        ],
      },
      { path: '', redirectTo: 'rooms', pathMatch: 'full' },
    ],
  },
];

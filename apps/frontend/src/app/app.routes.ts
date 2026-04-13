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
        path: 'memberships',
        title: 'Memberships — CardQuorum',
        loadComponent: () =>
          import('./room-listings/memberships-page').then((m) => m.MembershipsPage),
      },
      {
        path: 'discover',
        title: 'Discover — CardQuorum',
        loadComponent: () => import('./room-listings/discover-page').then((m) => m.DiscoverPage),
      },
      {
        path: 'rooms/:roomId',
        title: 'Room — CardQuorum',
        loadComponent: () => import('./room/room-view').then((m) => m.RoomView),
      },
      {
        path: 'rooms',
        redirectTo: 'memberships',
        pathMatch: 'full',
      },
      {
        path: 'user',
        loadComponent: () => import('./account/account-shell').then((m) => m.AccountShell),
        children: [
          {
            path: 'account',
            title: 'Account — CardQuorum',
            loadComponent: () => import('./account/account-page').then((m) => m.AccountPage),
          },
          {
            path: 'friends',
            title: 'Friends — CardQuorum',
            loadComponent: () => import('./account/friends-page').then((m) => m.FriendsPage),
          },
          { path: '', redirectTo: 'account', pathMatch: 'full' },
        ],
      },
      { path: '', redirectTo: 'memberships', pathMatch: 'full' },
    ],
  },
];

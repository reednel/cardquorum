import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isDeleteAccount = req.method === 'DELETE' && req.url.includes('/api/users/me');
      if (err.status === 401 && !isDeleteAccount) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};

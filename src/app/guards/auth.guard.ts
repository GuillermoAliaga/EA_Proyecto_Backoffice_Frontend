import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

// Solo para usuarios con sesión. Si no hay sesión, al login, recordando a dónde iba
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

// Solo para admin. Si intenta entrar alguien sin rol ADMIN, limpia sesión y vuelve al login
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) {
    return true;
  }

  auth.clearLocalSession();
  return router.createUrlTree(['/login']);
};

// Solo para quien NO tiene sesión. Si ya tiene sesión ADMIN, va al inicio
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
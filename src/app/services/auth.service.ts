import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, firstValueFrom, map, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  User,
} from '../models';

const USER_KEY = 'user';

function readStoredUser(): User | null {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as User;
    return parsed?.role?.toUpperCase() === 'ADMIN' ? parsed : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private baseUrl = `${environment.apiUrl}/auth`;

  private accessToken = signal<string | null>(null);
  private currentUser = signal<User | null>(readStoredUser());
  readonly user = this.currentUser.asReadonly();

  readonly isLoggedIn = computed(() => this.accessToken() !== null && this.isAdmin());
  readonly isAdmin = computed(() => this.currentUser()?.role?.toUpperCase() === 'ADMIN');

  // POST /auth/backoffice/login. Solo permite acceso a cuentas ADMIN
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/backoffice/login`, credentials, { withCredentials: true })
      .pipe(
        tap((response) => {
          if (response.user?.role?.toUpperCase() !== 'ADMIN') {
            this.clearLocalSession();
            throw new Error('Acceso denegado: este panel es exclusivo para administradores.');
          }
          this.accessToken.set(response.token);
          localStorage.setItem(USER_KEY, JSON.stringify(response.user));
          this.currentUser.set(response.user);
        }),
      );
  }

  // POST /auth/refresh
  refresh(): Observable<string> {
    return this.http
      .post<RefreshResponse>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((response) => this.accessToken.set(response.token)),
        map((response) => response.token),
      );
  }

  // Al arrancar la app: recupera sesión solo si la cuenta sigue teniendo rol ADMIN
  async restoreSession(): Promise<void> {
    try {
      await firstValueFrom(this.refresh());
      const { user } = await firstValueFrom(
        this.http.get<{ user: User }>(`${environment.apiUrl}/users/me`),
      );
      if (user?.role?.toUpperCase() !== 'ADMIN') {
        this.clearLocalSession();
        return;
      }
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      this.currentUser.set(user);
    } catch {
      this.clearLocalSession();
    }
  }

  // Cierra la sesión
  logout(): void {
    this.http
      .post(`${this.baseUrl}/logout`, {}, { withCredentials: true })
      .pipe(finalize(() => this.clearSession()))
      .subscribe({ error: () => { /* empty */ } });
  }

  clearLocalSession(): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(USER_KEY);
  }

  clearSession(): void {
    this.clearLocalSession();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.accessToken();
  }
}
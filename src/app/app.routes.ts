import { Routes } from '@angular/router';

import { ActivitiesList } from './components/activities-list/activities-list';
import { ActivityForm } from './components/activity-form/activity-form';
import { Chat } from './components/chat/chat';
import { Home } from './components/home/home';
import { Login } from './components/login/login';
import { ReportsList } from './components/reports-list/reports-list';
import { ReportForm } from './components/report-form/report-form';
import { UserForm } from './components/user-form/user-form';
import { UsersList } from './components/users-list/users-list';
import { adminGuard, authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: Home, canActivate: [authGuard, adminGuard], title: 'Inicio' },
  { path: 'login', component: Login, canActivate: [guestGuard], title: 'Iniciar sesión' },
  { path: 'users', component: UsersList, canActivate: [authGuard, adminGuard], title: 'Usuarios' },
  {
    path: 'users/new',
    component: UserForm,
    canActivate: [authGuard, adminGuard],
    title: 'Nuevo usuario',
  },
  {
    path: 'users/:id/edit',
    component: UserForm,
    canActivate: [authGuard, adminGuard],
    title: 'Editar usuario',
  },
  {
    path: 'activities',
    component: ActivitiesList,
    canActivate: [authGuard, adminGuard],
    title: 'Actividades',
  },
  {
    path: 'activities/new',
    component: ActivityForm,
    canActivate: [authGuard, adminGuard],
    title: 'Nueva actividad',
  },
  {
    path: 'activities/:id/edit',
    component: ActivityForm,
    canActivate: [authGuard, adminGuard],
    title: 'Editar actividad',
  },
  {
    path: 'reports',
    component: ReportsList,
    canActivate: [authGuard, adminGuard],
    title: 'Reportes',
  },
  {
    path: 'reports/new',
    component: ReportForm,
    canActivate: [authGuard, adminGuard],
    title: 'Nuevo reporte',
  },
  {
    path: 'reports/:id/edit',
    component: ReportForm,
    canActivate: [authGuard, adminGuard],
    title: 'Revisar reporte',
  },
  { path: 'chat', component: Chat, canActivate: [authGuard, adminGuard], title: 'Chat' },
  { path: '**', redirectTo: '' },
];
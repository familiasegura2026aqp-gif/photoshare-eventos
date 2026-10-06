import { Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { EventPageComponent } from './event-page.component';
import { HomeComponent } from './home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', component: AdminComponent },
  { path: 'event/:code', component: EventPageComponent },
  { path: '**', redirectTo: '' },
];

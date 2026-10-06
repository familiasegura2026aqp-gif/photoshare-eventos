import { Routes } from '@angular/router';
import { EventPageComponent } from './event-page.component';
import { HomeComponent } from './home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'event/:code', component: EventPageComponent },
  { path: '**', redirectTo: '' },
];

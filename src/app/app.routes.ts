import { Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { EventPageComponent } from './event-page.component';
import { FamilyTreeComponent } from './family-tree.component';
import { HomeComponent } from './home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', component: AdminComponent },
  { path: 'family', component: FamilyTreeComponent },
  { path: 'family/view', component: FamilyTreeComponent, data: { readOnly: true } },
  { path: 'event/:code', component: EventPageComponent },
  { path: '**', redirectTo: '' },
];

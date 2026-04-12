import { Route } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AgentsComponent } from './agents/agents.component';
import { TasksComponent } from './tasks/tasks.component';
import { TransactionsComponent } from './transactions/transactions.component';
import { VisibilityAuditComponent } from './visibility/visibility.component';
import { DocsComponent } from './docs/docs.component';

export const appRoutes: Route[] = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'agents', component: AgentsComponent },
  { path: 'tasks', component: TasksComponent },
  { path: 'transactions', component: TransactionsComponent },
  { path: 'visibility', component: VisibilityAuditComponent },
  { path: 'docs', component: DocsComponent },
  { path: 'docs/:slug', component: DocsComponent },
];

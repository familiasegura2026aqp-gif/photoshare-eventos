import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventStoreService } from './event-store.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  protected readonly eventCode = signal('');
  protected readonly events = computed(() => this.store.events());

  constructor(
    private readonly router: Router,
    private readonly store: EventStoreService,
  ) {}

  protected enterEvent(): void {
    const code = this.eventCode().trim().toUpperCase();
    if (!code) {
      return;
    }

    void this.router.navigate(['/event', code]);
  }
}

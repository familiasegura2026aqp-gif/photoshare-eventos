import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { EventStoreService } from './event-store.service';
import { EventSummary } from './models';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  protected readonly eventName = signal('');
  protected readonly selectedEvent = signal<EventSummary | null>(null);
  protected readonly qrDataUrl = signal('');
  protected readonly events = computed(() => this.store.events());

  constructor(private readonly store: EventStoreService) {}

  protected async createEvent(): Promise<void> {
    const name = this.eventName().trim();
    if (!name) {
      return;
    }

    const event = await this.store.createEvent(name);
    this.selectedEvent.set(event);
    this.eventName.set('');
    this.qrDataUrl.set(await QRCode.toDataURL(this.eventUrl(event.code), { margin: 1, width: 256 }));
  }

  protected eventUrl(code: string): string {
    return `${location.origin}${location.pathname}#/event/${code}`;
  }
}

import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { environment } from '../environments/environment';
import { EventStoreService } from './event-store.service';
import { EventSummary } from './models';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent {
  protected readonly eventName = signal('');
  protected readonly accessQrDataUrl = signal('');
  protected readonly accessUrl = signal('');
  protected readonly editingCode = signal('');
  protected readonly editingName = signal('');
  protected readonly statusMessage = signal('');
  protected readonly selectedEvent = signal<EventSummary | null>(null);
  protected readonly qrDataUrl = signal('');
  protected readonly selectedEventUrl = signal('');
  protected readonly qrByEvent = signal<Record<string, string>>({});
  protected readonly events = computed(() => this.store.events());
  private readonly pendingQr = new Set<string>();

  constructor(private readonly store: EventStoreService) {
    void this.generateAccessQr();
  }

  protected async createEvent(): Promise<void> {
    const name = this.eventName().trim();
    if (!name) {
      return;
    }

    const event = await this.store.createEvent(name);
    await this.showQr(event);
    this.eventName.set('');
  }

  protected async showQr(event: EventSummary): Promise<void> {
    const url = this.eventUrl(event.code);
    this.selectedEvent.set(event);
    this.selectedEventUrl.set(url);
    const qr = await this.generateQr(event);
    this.qrDataUrl.set(qr);
  }

  protected qrFor(event: EventSummary): string {
    const qr = this.qrByEvent()[event.id];
    if (!qr && !this.pendingQr.has(event.id)) {
      void this.generateQr(event);
    }

    return qr ?? '';
  }

  protected startEdit(event: EventSummary): void {
    this.statusMessage.set('');
    this.editingCode.set(event.code);
    this.editingName.set(event.name);
  }

  protected cancelEdit(): void {
    this.editingCode.set('');
    this.editingName.set('');
  }

  protected async saveEdit(event: EventSummary): Promise<void> {
    const name = this.editingName().trim();
    if (!name) {
      return;
    }

    try {
      await this.store.renameEvent(event.code, name);
      this.statusMessage.set('Evento actualizado.');
      this.cancelEdit();
    } catch {
      this.statusMessage.set('No se pudo actualizar el evento.');
    }
  }

  protected async removeEvent(event: EventSummary): Promise<void> {
    const confirmed = confirm(`Eliminar el evento "${event.name}"? Las fotos en Drive no se borraran.`);
    if (!confirmed) {
      return;
    }

    try {
      await this.store.deleteEvent(event.code);
      this.statusMessage.set('Evento eliminado.');
      if (this.selectedEvent()?.code === event.code) {
        this.selectedEvent.set(null);
        this.qrDataUrl.set('');
        this.selectedEventUrl.set('');
      }
    } catch {
      this.statusMessage.set('No se pudo eliminar el evento.');
    }
  }

  protected eventUrl(code: string): string {
    const baseUrl = environment.publicBaseUrl || `${location.origin}${location.pathname.replace(/admin\/?$/, '')}`;
    return `${baseUrl.replace(/\/?$/, '/')}#/event/${code}`;
  }

  private async generateAccessQr(): Promise<void> {
    const baseUrl = environment.publicBaseUrl || `${location.origin}${location.pathname.replace(/admin\/?$/, '')}`;
    const url = baseUrl.replace(/\/?$/, '/');
    this.accessUrl.set(url);
    this.accessQrDataUrl.set(await QRCode.toDataURL(url, { margin: 1, width: 256 }));
  }

  private async generateQr(event: EventSummary): Promise<string> {
    const existing = this.qrByEvent()[event.id];
    if (existing) {
      return existing;
    }

    this.pendingQr.add(event.id);
    const qr = await QRCode.toDataURL(this.eventUrl(event.code), { margin: 1, width: 220 });
    this.qrByEvent.update((items) => ({ ...items, [event.id]: qr }));
    this.pendingQr.delete(event.id);
    return qr;
  }
}

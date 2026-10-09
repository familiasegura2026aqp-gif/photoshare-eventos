import { DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventStoreService } from './event-store.service';
import { PhotoItem } from './models';

@Component({
  imports: [DatePipe, FormsModule, RouterLink],
  selector: 'app-event-page',
  templateUrl: './event-page.component.html',
  styleUrl: './event-page.component.scss',
})
export class EventPageComponent {
  protected readonly code = signal('');
  protected readonly isUploading = signal(false);
  protected readonly uploadMessage = signal('');
  protected readonly selectedPhoto = signal<PhotoItem | null>(null);
  protected readonly event = computed(() => this.store.findEvent(this.code()));
  protected readonly photos = computed(() => this.store.listPhotos(this.code()));

  constructor(
    private readonly route: ActivatedRoute,
    private readonly store: EventStoreService,
  ) {
    this.code.set(this.route.snapshot.paramMap.get('code') ?? '');
    void this.store.loadPhotos(this.code());
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.isUploading.set(true);
    this.uploadMessage.set('');
    try {
      await this.store.addPhoto(this.code(), file, '');
      await this.store.loadPhotos(this.code());
      this.uploadMessage.set('Archivo subido correctamente.');
    } catch (error) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      const detail = `${file.name || 'archivo'} (${sizeMb} MB)`;
      this.uploadMessage.set(
        error instanceof Error ? `${error.message} ${detail}` : `No se pudo subir el archivo. ${detail}`,
      );
    } finally {
      input.value = '';
      this.isUploading.set(false);
    }
  }
}

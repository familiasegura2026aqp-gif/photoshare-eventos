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
    const files = Array.from(input.files ?? []);
    if (!files.length) {
      return;
    }

    this.isUploading.set(true);
    this.uploadMessage.set('');
    let uploaded = 0;
    const failures: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        this.uploadMessage.set(`Subiendo ${index + 1} de ${files.length}: ${file.name}`);
        try {
          await this.store.addPhoto(this.code(), file, '');
          uploaded += 1;
        } catch (error) {
          failures.push(error instanceof Error ? `${file.name}: ${error.message}` : file.name);
        }
      }
      await this.store.loadPhotos(this.code());
      this.uploadMessage.set(
        failures.length
          ? `${uploaded} de ${files.length} archivos subidos. No se pudieron subir: ${failures.join(' | ')}`
          : `${uploaded} archivo${uploaded === 1 ? '' : 's'} subido${uploaded === 1 ? '' : 's'} correctamente.`,
      );
    } finally {
      input.value = '';
      this.isUploading.set(false);
    }
  }

  protected async downloadPhoto(photo: PhotoItem): Promise<void> {
    const response = await fetch(photo.dataUrl);
    if (!response.ok) {
      this.uploadMessage.set('No se pudo descargar el archivo.');
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = photo.filename || 'photoshare-archivo';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

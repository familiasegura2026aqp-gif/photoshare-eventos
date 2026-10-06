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
  protected readonly uploaderName = signal('');
  protected readonly isUploading = signal(false);
  protected readonly selectedPhoto = signal<PhotoItem | null>(null);
  protected readonly event = computed(() => this.store.findEvent(this.code()));
  protected readonly photos = computed(() => this.store.listPhotos(this.code()));

  constructor(
    private readonly route: ActivatedRoute,
    private readonly store: EventStoreService,
  ) {
    this.code.set(this.route.snapshot.paramMap.get('code') ?? '');
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.isUploading.set(true);
    try {
      await this.store.addPhoto(this.code(), file, this.uploaderName());
    } finally {
      input.value = '';
      this.isUploading.set(false);
    }
  }
}

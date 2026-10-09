import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { EventSummary, PhotoItem } from './models';
import { supabase } from './supabase.client';

const EVENTS_KEY = 'photoshare.events';
const PHOTOS_KEY = 'photoshare.photos';

@Injectable({ providedIn: 'root' })
export class EventStoreService {
  private readonly eventsSignal = signal<EventSummary[]>(this.read<EventSummary[]>(EVENTS_KEY, []));
  private readonly photosSignal = signal<PhotoItem[]>(this.read<PhotoItem[]>(PHOTOS_KEY, []));

  readonly events = this.eventsSignal.asReadonly();
  readonly photos = this.photosSignal.asReadonly();

  constructor() {
    void this.loadEvents();
  }

  async createEvent(name: string): Promise<EventSummary> {
    const code = this.createCode(name);
    const apiEvent = await this.createEventWithApi(name, code);
    if (apiEvent) {
      this.eventsSignal.update((events) => [apiEvent, ...events]);
      this.persist(EVENTS_KEY, this.eventsSignal());
      return apiEvent;
    }

    if (environment.apiBaseUrl) {
      throw new Error('No se pudo crear el evento en Drive. Revisa la configuracion del backend.');
    }

    const { data, error } = await supabase
      .from('events')
      .insert({ name, code })
      .select('id, name, code, created_at')
      .single();

    const event: EventSummary = error
      ? {
          id: crypto.randomUUID(),
          name,
          code,
          createdAt: new Date().toISOString(),
          photoCount: 0,
        }
      : {
          id: data.id,
          name: data.name,
          code: data.code,
          createdAt: data.created_at,
          photoCount: 0,
        };

    this.eventsSignal.update((events) => [event, ...events]);
    this.persist(EVENTS_KEY, this.eventsSignal());
    return event;
  }

  findEvent(code: string): EventSummary | undefined {
    return this.eventsSignal().find((event) => event.code.toUpperCase() === code.toUpperCase());
  }

  async renameEvent(code: string, name: string): Promise<void> {
    if (environment.apiBaseUrl) {
      const response = await fetch(`${environment.apiBaseUrl}/events/${encodeURIComponent(code)}`, {
        body: JSON.stringify({ name }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error('No se pudo modificar el evento.');
      }
    } else {
      const { error } = await supabase.from('events').update({ name }).eq('code', code);
      if (error) {
        throw error;
      }
    }

    this.eventsSignal.update((events) =>
      events.map((event) => (event.code === code ? { ...event, name } : event)),
    );
    this.persist(EVENTS_KEY, this.eventsSignal());
  }

  async deleteEvent(code: string): Promise<void> {
    if (environment.apiBaseUrl) {
      const response = await fetch(`${environment.apiBaseUrl}/events/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('No se pudo eliminar el evento.');
      }
    } else {
      const { error } = await supabase.from('events').delete().eq('code', code);
      if (error) {
        throw error;
      }
    }

    this.eventsSignal.update((events) => events.filter((event) => event.code !== code));
    this.persist(EVENTS_KEY, this.eventsSignal());
  }

  listPhotos(eventCode: string): PhotoItem[] {
    return this.photosSignal()
      .filter((photo) => photo.eventCode.toUpperCase() === eventCode.toUpperCase())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async loadPhotos(eventCode: string): Promise<void> {
    if (!environment.apiBaseUrl) {
      return;
    }

    const response = await fetch(`${environment.apiBaseUrl}/photos/${encodeURIComponent(eventCode)}`);
    if (!response.ok) {
      return;
    }

    const rows = (await response.json()) as Array<{
      created_at: string;
      filename: string;
      id: string;
      thumbnail_url: string | null;
      uploader_name: string | null;
    }>;
    const remotePhotos = rows.map((row) => {
      const mediaType = this.mediaTypeFromFilename(row.filename);
      return {
        id: row.id,
        eventCode,
        filename: row.filename,
        dataUrl: row.thumbnail_url ?? '',
        thumbnailUrl: row.thumbnail_url ?? '',
        mediaType,
        createdAt: row.created_at,
        uploaderName: row.uploader_name ?? undefined,
      } satisfies PhotoItem;
    });
    const otherPhotos = this.photosSignal().filter(
      (photo) => photo.eventCode.toUpperCase() !== eventCode.toUpperCase(),
    );

    this.photosSignal.set([...remotePhotos, ...otherPhotos]);
    this.persist(PHOTOS_KEY, this.photosSignal());
  }

  async addPhoto(eventCode: string, file: File, uploaderName: string): Promise<PhotoItem> {
    const isVideo = file.type.startsWith('video/');
    const dataUrl = URL.createObjectURL(file);
    await this.uploadToApi(eventCode, file, uploaderName);
    const photo: PhotoItem = {
      id: crypto.randomUUID(),
      eventCode,
      filename: file.name,
      dataUrl,
      thumbnailUrl: dataUrl,
      mediaType: isVideo ? 'video' : 'image',
      createdAt: new Date().toISOString(),
      uploaderName: uploaderName.trim() || undefined,
    };

    this.photosSignal.update((photos) => [photo, ...photos]);
    this.persist(PHOTOS_KEY, this.photosSignal());
    this.eventsSignal.update((events) =>
      events.map((event) =>
        event.code.toUpperCase() === eventCode.toUpperCase()
          ? { ...event, photoCount: event.photoCount + 1 }
          : event,
      ),
    );
    this.persist(EVENTS_KEY, this.eventsSignal());
    return photo;
  }

  private createCode(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .slice(0, 8)
      .toUpperCase();

    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${base || 'EVENTO'}${new Date().getFullYear()}${suffix}`;
  }

  private mediaTypeFromFilename(filename: string): 'image' | 'video' {
    return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(filename) ? 'video' : 'image';
  }

  private async loadEvents(): Promise<void> {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, code, created_at, photos(id)')
      .order('created_at', { ascending: false });

    if (error || !data) {
      return;
    }

    const events = data.map((event) => ({
      id: event.id,
      name: event.name,
      code: event.code,
      createdAt: event.created_at,
      photoCount: event.photos?.length ?? 0,
    }));

    this.eventsSignal.set(events);
    this.persist(EVENTS_KEY, events);
  }

  private async createEventWithApi(name: string, code: string): Promise<EventSummary | null> {
    if (!environment.apiBaseUrl) {
      return null;
    }

    try {
      const response = await fetch(`${environment.apiBaseUrl}/create-event`, {
        body: JSON.stringify({ code, name }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        return null;
      }

      const event = (await response.json()) as {
        code: string;
        created_at: string;
        id: string;
        name: string;
      };

      return {
        id: event.id,
        name: event.name,
        code: event.code,
        createdAt: event.created_at,
        photoCount: 0,
      };
    } catch {
      return null;
    }
  }

  private async uploadToApi(eventCode: string, file: File, uploaderName: string): Promise<void> {
    if (!environment.apiBaseUrl) {
      return;
    }

    const form = new FormData();
    form.set('eventCode', eventCode);
    form.set('uploaderName', uploaderName);
    form.set('file', file);

    const response = await fetch(`${environment.apiBaseUrl}/upload`, {
      body: form,
      method: 'POST',
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message || 'No se pudo subir el archivo al servidor.');
    }
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const value = localStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private persist<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

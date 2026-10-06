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

  async addPhoto(eventCode: string, file: File, uploaderName: string): Promise<PhotoItem> {
    const dataUrl = await this.compressImage(file);
    const uploadFile = this.dataUrlToFile(dataUrl, file.name);
    await this.uploadToApi(eventCode, uploadFile, uploaderName);
    const photo: PhotoItem = {
      id: crypto.randomUUID(),
      eventCode,
      filename: file.name,
      dataUrl,
      thumbnailUrl: dataUrl,
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

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
        image.onload = () => {
          const maxWidth = 1920;
          const maxHeight = 1080;
          const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * ratio);
          canvas.height = Math.round(image.height * ratio);

          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('No se pudo preparar la imagen.'));
            return;
          }

          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
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
      throw new Error(error?.message || 'No se pudo subir la foto al servidor.');
    }
  }

  private dataUrlToFile(dataUrl: string, originalName: string): File {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const filename = originalName.replace(/\.[^.]+$/, '') || 'photo';
    return new File([bytes], `${filename}.jpg`, { type: mime });
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

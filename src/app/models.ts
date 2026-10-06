export interface EventSummary {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  photoCount: number;
}

export interface PhotoItem {
  id: string;
  eventCode: string;
  filename: string;
  dataUrl: string;
  thumbnailUrl: string;
  createdAt: string;
  uploaderName?: string;
}

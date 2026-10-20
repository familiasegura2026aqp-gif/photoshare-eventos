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
  mediaType: 'image' | 'video';
  createdAt: string;
  uploaderName?: string;
}

export interface FamilyMember {
  id: string;
  treeId: string;
  parentId: string | null;
  firstName: string;
  lastName: string;
  paternalSurname: string;
  maternalSurname: string;
  birthPlace: string | null;
  residence: string | null;
  deathDate: string | null;
  burialPlace: string | null;
  biography: string | null;
  profession: string | null;
  phone: string | null;
  email: string | null;
  socialLinks: string | null;
  birthDate: string | null;
  notes: string | null;
  photoUrl: string | null;
  isDeceased: boolean;
  isPrimary: boolean;
  createdAt: string;
}

export interface FamilyRelationship {
  id: string;
  treeId: string;
  memberAId: string;
  memberBId: string;
  relationType: 'partner';
  status: 'together' | 'separated';
}

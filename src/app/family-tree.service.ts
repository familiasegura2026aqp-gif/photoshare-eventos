import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { supabase } from './supabase.client';
import { FamilyMember, FamilyRelationship } from './models';

type MemberInput = Omit<FamilyMember, 'id' | 'treeId' | 'createdAt' | 'isDeceased' | 'isPrimary' | 'photoUrl'> & { photoUrl?: string | null };

@Injectable({ providedIn: 'root' })
export class FamilyTreeService {
  private static readonly localMembersKey = 'photoshare.family-members';
  private static readonly localRelationshipsKey = 'photoshare.family-relationships';
  private readonly membersSignal = signal<FamilyMember[]>([]);
  private readonly relationshipsSignal = signal<FamilyRelationship[]>([]);
  private readonly treeIdSignal = signal<string | null>(null);

  readonly members = this.membersSignal.asReadonly();
  readonly relationships = this.relationshipsSignal.asReadonly();
  readonly treeId = this.treeIdSignal.asReadonly();

  async load(): Promise<void> {
    const { data: trees, error: treeError } = await supabase
      .from('family_trees')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1);

    if (treeError && this.canUseLocalPreview(treeError)) {
      this.loadLocalPreview();
      return;
    }
    if (treeError || !trees?.length) {
      this.treeIdSignal.set(null);
      this.membersSignal.set([]);
      this.relationshipsSignal.set([]);
      return;
    }

    const treeId = trees[0].id;
    this.treeIdSignal.set(treeId);
    const [{ data: members, error: membersError }, { data: relationships, error: relationshipsError }] = await Promise.all([
      supabase.from('family_members').select('*').eq('tree_id', treeId).order('created_at', { ascending: true }),
      supabase.from('family_relationships').select('*').eq('tree_id', treeId),
    ]);

    if ((membersError || relationshipsError) && this.canUseLocalPreview(membersError || relationshipsError!)) {
      this.loadLocalPreview();
      return;
    }
    if (!membersError && members) this.membersSignal.set(members.map((member) => this.mapMember(member)));
    if (!relationshipsError && relationships) this.relationshipsSignal.set(relationships.map((item) => this.mapRelationship(item)));
  }

  async addMember(input: MemberInput): Promise<FamilyMember | null> {
    return this.createMember(input);
  }

  async addParent(childId: string, input: MemberInput): Promise<FamilyMember | null> {
    const parent = await this.createMember({ ...input, parentId: null });
    if (!parent) return null;

    if (this.isLocalPreview()) {
      this.membersSignal.update((members) => members.map((member) =>
        member.id === childId ? { ...member, parentId: parent.id } : member,
      ));
      this.persistLocalPreview();
      return parent;
    }
    const { error } = await supabase.from('family_members').update({ parent_id: parent.id }).eq('id', childId);
    if (error) throw new Error('Se creo la persona, pero no se pudo vincular como padre o madre.');
    await this.load();
    return parent;
  }

  async addPartner(memberId: string, input: MemberInput): Promise<FamilyMember | null> {
    const partner = await this.createMember({ ...input, parentId: null });
    if (!partner) return null;
    const relationship: FamilyRelationship = {
      id: crypto.randomUUID(), treeId: partner.treeId, memberAId: memberId, memberBId: partner.id, relationType: 'partner', status: 'together',
    };
    if (this.isLocalPreview()) {
      this.relationshipsSignal.update((relationships) => [...relationships, relationship]);
      this.persistLocalPreview();
      return partner;
    }
    const { error } = await supabase.from('family_relationships').insert({
      tree_id: relationship.treeId, member_a_id: relationship.memberAId, member_b_id: relationship.memberBId, relation_type: relationship.relationType, status: relationship.status,
    });
    if (error) throw new Error('Se creo la persona, pero no se pudo vincular como pareja.');
    await this.load();
    return partner;
  }

  async setPersonDeceased(memberId: string, isDeceased: boolean): Promise<void> {
    if (this.isLocalPreview()) {
      this.membersSignal.update((members) => members.map((member) => member.id === memberId ? { ...member, isDeceased } : member));
      this.persistLocalPreview();
      return;
    }
    const { error } = await supabase.from('family_members').update({ is_deceased: isDeceased }).eq('id', memberId);
    if (error) throw new Error('No se pudo actualizar el estado de la persona.');
    this.membersSignal.update((members) => members.map((member) => member.id === memberId ? { ...member, isDeceased } : member));
  }

  async updateMember(memberId: string, input: MemberInput): Promise<void> {
    if (this.isLocalPreview()) {
      this.membersSignal.update((members) => members.map((member) => member.id === memberId ? {
        ...member,
        firstName: input.firstName,
        lastName: `${input.paternalSurname} ${input.maternalSurname}`.trim() || input.lastName,
        paternalSurname: input.paternalSurname,
        maternalSurname: input.maternalSurname,
        birthDate: input.birthDate,
        notes: input.notes,
        photoUrl: input.photoUrl || null,
        birthPlace: input.birthPlace, residence: input.residence, deathDate: input.deathDate, burialPlace: input.burialPlace, biography: input.biography, profession: input.profession, phone: input.phone, email: input.email, socialLinks: input.socialLinks,
      } : member));
      this.persistLocalPreview();
      return;
    }
    const { error } = await supabase.from('family_members').update({
      first_name: input.firstName,
      last_name: `${input.paternalSurname} ${input.maternalSurname}`.trim() || input.lastName,
      paternal_surname: input.paternalSurname,
      maternal_surname: input.maternalSurname,
      birth_date: input.birthDate || null,
      notes: input.notes || null,
      profile_photo_url: input.photoUrl || null,
      birth_place: input.birthPlace || null, residence: input.residence || null, death_date: input.deathDate || null, burial_place: input.burialPlace || null, biography: input.biography || null, profession: input.profession || null, phone: input.phone || null, email: input.email || null, social_links: input.socialLinks || null,
    }).eq('id', memberId);
    if (error) throw new Error('No se pudo actualizar la persona.');
    this.membersSignal.update((members) => members.map((member) => member.id === memberId ? {
      ...member,
      firstName: input.firstName,
      lastName: `${input.paternalSurname} ${input.maternalSurname}`.trim() || input.lastName,
      paternalSurname: input.paternalSurname,
      maternalSurname: input.maternalSurname,
      birthDate: input.birthDate,
      notes: input.notes,
      photoUrl: input.photoUrl || null,
    } : member));
  }

  async deleteMember(memberId: string): Promise<void> {
    if (this.membersSignal().some((member) => member.parentId === memberId)) {
      throw new Error('No se puede eliminar a una persona que tiene hijos registrados.');
    }
    if (this.isLocalPreview()) {
      this.membersSignal.update((members) => members.filter((member) => member.id !== memberId));
      this.relationshipsSignal.update((relationships) => relationships.filter((item) => item.memberAId !== memberId && item.memberBId !== memberId));
      this.persistLocalPreview();
      return;
    }
    const { error } = await supabase.from('family_members').delete().eq('id', memberId);
    if (error) throw new Error('No se pudo eliminar la persona.');
    this.membersSignal.update((members) => members.filter((member) => member.id !== memberId));
    this.relationshipsSignal.update((relationships) => relationships.filter((item) => item.memberAId !== memberId && item.memberBId !== memberId));
  }

  async setPrimaryMember(memberId: string): Promise<void> {
    if (this.isLocalPreview()) {
      this.membersSignal.update((members) => members.map((member) => ({ ...member, isPrimary: member.id === memberId })));
      this.persistLocalPreview();
      return;
    }
    const treeId = this.treeIdSignal();
    if (!treeId) return;
    const { error: clearError } = await supabase.from('family_members').update({ is_primary: false }).eq('tree_id', treeId);
    if (clearError) throw new Error('No se pudo definir la persona principal.');
    const { error } = await supabase.from('family_members').update({ is_primary: true }).eq('id', memberId);
    if (error) throw new Error('No se pudo definir la persona principal.');
    this.membersSignal.update((members) => members.map((member) => ({ ...member, isPrimary: member.id === memberId })));
  }

  async setPartnerStatus(memberId: string, status: 'together' | 'separated'): Promise<void> {
    const relationship = this.relationshipsSignal().find((item) => item.memberAId === memberId || item.memberBId === memberId);
    if (!relationship) return;
    if (this.isLocalPreview()) {
      this.relationshipsSignal.update((items) => items.map((item) => item.id === relationship.id ? { ...item, status } : item));
      this.persistLocalPreview();
      return;
    }
    const { error } = await supabase.from('family_relationships').update({ status }).eq('id', relationship.id);
    if (error) throw new Error('No se pudo actualizar el estado de la pareja.');
    this.relationshipsSignal.update((items) => items.map((item) => item.id === relationship.id ? { ...item, status } : item));
  }

  private async createMember(input: MemberInput): Promise<FamilyMember | null> {
    if (this.isLocalPreview()) return this.addLocalPreviewMember(input);
    let treeId = this.treeIdSignal();
    if (!treeId) {
      const { data, error } = await supabase.from('family_trees').insert({ name: 'Mi familia' }).select('id').single();
      if (error && this.canUseLocalPreview(error)) return this.addLocalPreviewMember(input);
      if (error || !data) throw new Error('No se pudo crear el arbol familiar. Ejecuta primero el SQL en Supabase.');
      treeId = data.id;
      this.treeIdSignal.set(treeId);
    }
    const { data, error } = await supabase.from('family_members').insert({
      tree_id: treeId, parent_id: input.parentId, first_name: input.firstName, last_name: `${input.paternalSurname} ${input.maternalSurname}`.trim() || input.lastName, paternal_surname: input.paternalSurname, maternal_surname: input.maternalSurname,
      birth_date: input.birthDate || null, notes: input.notes || null, is_deceased: false, is_primary: this.membersSignal().length === 0, profile_photo_url: input.photoUrl || null, birth_place: input.birthPlace || null, residence: input.residence || null, death_date: input.deathDate || null, burial_place: input.burialPlace || null, biography: input.biography || null, profession: input.profession || null, phone: input.phone || null, email: input.email || null, social_links: input.socialLinks || null,
    }).select('*').single();
    if (error && this.canUseLocalPreview(error)) return this.addLocalPreviewMember(input);
    if (error || !data) throw new Error('No se pudo guardar a la persona. Ejecuta primero el SQL en Supabase.');
    const member = this.mapMember(data);
    this.membersSignal.update((members) => [...members, member]);
    return member;
  }

  private mapMember(row: any): FamilyMember {
    return { id: row.id, treeId: row.tree_id, parentId: row.parent_id, firstName: row.first_name, lastName: row.last_name, paternalSurname: row.paternal_surname || row.last_name || '', maternalSurname: row.maternal_surname || '', birthDate: row.birth_date, birthPlace: row.birth_place || null, residence: row.residence || null, deathDate: row.death_date || null, burialPlace: row.burial_place || null, biography: row.biography || null, profession: row.profession || null, phone: row.phone || null, email: row.email || null, socialLinks: row.social_links || null, notes: row.notes, photoUrl: row.profile_photo_url || null, isDeceased: Boolean(row.is_deceased), isPrimary: Boolean(row.is_primary), createdAt: row.created_at };
  }

  private mapRelationship(row: any): FamilyRelationship {
    return { id: row.id, treeId: row.tree_id, memberAId: row.member_a_id, memberBId: row.member_b_id, relationType: row.relation_type, status: row.status || 'together' };
  }

  private canUseLocalPreview(error: { code?: string }): boolean {
    return !environment.production && (error.code === '42P01' || error.code === 'PGRST205');
  }

  private isLocalPreview(): boolean {
    return this.treeIdSignal() === 'local-preview-tree';
  }

  private loadLocalPreview(): void {
    const members = JSON.parse(localStorage.getItem(FamilyTreeService.localMembersKey) || '[]') as FamilyMember[];
    const relationships = JSON.parse(localStorage.getItem(FamilyTreeService.localRelationshipsKey) || '[]') as FamilyRelationship[];
    this.treeIdSignal.set('local-preview-tree');
    this.membersSignal.set(members);
    this.relationshipsSignal.set(relationships);
  }

  private addLocalPreviewMember(input: MemberInput): FamilyMember {
    const member: FamilyMember = { ...input, lastName: `${input.paternalSurname} ${input.maternalSurname}`.trim() || input.lastName, photoUrl: input.photoUrl || null, isDeceased: false, isPrimary: this.membersSignal().length === 0, id: crypto.randomUUID(), treeId: 'local-preview-tree', createdAt: new Date().toISOString() };
    this.membersSignal.update((members) => [...members, member]);
    this.treeIdSignal.set('local-preview-tree');
    this.persistLocalPreview();
    return member;
  }

  private persistLocalPreview(): void {
    localStorage.setItem(FamilyTreeService.localMembersKey, JSON.stringify(this.membersSignal()));
    localStorage.setItem(FamilyTreeService.localRelationshipsKey, JSON.stringify(this.relationshipsSignal()));
  }
}

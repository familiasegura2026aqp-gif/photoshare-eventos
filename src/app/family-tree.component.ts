import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { environment } from '../environments/environment';
import { FamilyMember } from './models';
import { FamilyTreeService } from './family-tree.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-family-tree',
  templateUrl: './family-tree.component.html',
  styleUrl: './family-tree.component.scss',
})
export class FamilyTreeComponent {
  private readonly store = inject(FamilyTreeService);
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly paternalSurname = signal('');
  protected readonly maternalSurname = signal('');
  protected readonly birthDate = signal('');
  protected readonly notes = signal('');
  protected readonly photoUrl = signal<string | null>(null);
  protected readonly birthPlace = signal('');
  protected readonly residence = signal('');
  protected readonly deathDate = signal('');
  protected readonly burialPlace = signal('');
  protected readonly biography = signal('');
  protected readonly profession = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly socialLinks = signal('');
  protected readonly searchQuery = signal('');
  protected readonly showShare = signal(false);
  protected readonly shareQr = signal('');
  protected readonly shareUrl = signal('');
  protected readonly isDeceased = signal(false);
  protected readonly partnerSeparated = signal(false);
  protected readonly isPrimary = signal(false);
  protected readonly modalOpen = signal(false);
  protected readonly editingMemberId = signal<string | null>(null);
  protected readonly photoViewer = signal<FamilyMember | null>(null);
  protected readonly parentId = signal<string | null>(null);
  protected readonly formMode = signal<'root' | 'child' | 'parent' | 'partner'>('root');
  protected readonly selectedMember = signal<FamilyMember | null>(null);
  protected readonly message = signal('');
  protected readonly members = this.store.members;
  protected readonly relationships = this.store.relationships;
  protected readonly roots = computed(() => {
    const primary = this.members().find((member) => member.isPrimary);
    if (primary) return [primary];
    const partnerIds = new Set(this.relationships().map((relationship) => relationship.memberBId));
    return this.members().filter((member) => !member.parentId && !partnerIds.has(member.id));
  });
  protected readonly isAddingRoot = computed(() => !this.members().length);
  protected readonly focusedMember = computed(() => this.selectedMember() ?? this.roots()[0] ?? null);
  private readonly route = inject(ActivatedRoute);
  protected readonly readOnly = this.route.snapshot.data['readOnly'] === true;
  protected readonly searchResults = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return query ? this.members().filter((member) => this.fullName(member).toLowerCase().includes(query)).slice(0, 8) : [];
  });

  constructor() {
    void this.store.load();
    void this.generateShareQr();
  }

  protected childrenOf(parentId: string): FamilyMember[] {
    return this.members().filter((member) => member.parentId === parentId);
  }

  protected familyChildrenOf(member: FamilyMember): FamilyMember[] {
    const partner = this.partnerOf(member.id);
    const parentIds = new Set([member.id, partner?.id].filter((id): id is string => Boolean(id)));
    return this.members().filter((child) => child.parentId !== null && parentIds.has(child.parentId));
  }

  protected familyName(member: FamilyMember): string {
    const partner = this.partnerOf(member.id);
    return partner ? `${member.firstName} y ${partner.firstName}` : member.firstName;
  }

  protected openAddChild(member: FamilyMember): void {
    this.editingMemberId.set(null);
    this.parentId.set(member.id);
    this.formMode.set('child');
    this.selectedMember.set(member);
    this.firstName.set('');
    this.lastName.set(member.lastName);
    this.paternalSurname.set(member.paternalSurname || member.lastName);
    this.maternalSurname.set(member.maternalSurname || '');
    this.birthDate.set('');
    this.notes.set('');
    this.photoUrl.set(null);
    this.resetExtendedFields();
    this.isDeceased.set(false);
    this.partnerSeparated.set(false);
    this.isPrimary.set(false);
    this.modalOpen.set(true);
    this.message.set(`Agregando hijo/a de ${this.fullName(member)}.`);
  }

  protected openAddParent(member: FamilyMember): void {
    this.editingMemberId.set(null);
    this.parentId.set(member.id);
    this.formMode.set('parent');
    this.selectedMember.set(member);
    this.firstName.set('');
    this.lastName.set(member.lastName);
    this.paternalSurname.set(member.paternalSurname || member.lastName);
    this.maternalSurname.set(member.maternalSurname || '');
    this.birthDate.set('');
    this.notes.set('');
    this.photoUrl.set(null);
    this.resetExtendedFields();
    this.isDeceased.set(false);
    this.partnerSeparated.set(false);
    this.isPrimary.set(false);
    this.modalOpen.set(true);
    this.message.set(`Agregando padre o madre de ${this.fullName(member)}.`);
  }

  protected openAddPartner(member: FamilyMember): void {
    this.editingMemberId.set(null);
    this.parentId.set(member.id);
    this.formMode.set('partner');
    this.selectedMember.set(member);
    this.firstName.set('');
    this.lastName.set(member.lastName);
    this.paternalSurname.set(member.paternalSurname || member.lastName);
    this.maternalSurname.set(member.maternalSurname || '');
    this.birthDate.set('');
    this.notes.set('');
    this.photoUrl.set(null);
    this.resetExtendedFields();
    this.isDeceased.set(false);
    this.partnerSeparated.set(false);
    this.isPrimary.set(false);
    this.modalOpen.set(true);
    this.message.set(`Agregando pareja de ${this.fullName(member)}.`);
  }

  protected selectMember(member: FamilyMember): void {
    this.selectedMember.set(member);
  }

  protected openAddRoot(): void {
    this.editingMemberId.set(null);
    this.formMode.set('root');
    this.parentId.set(null);
    this.firstName.set('');
    this.lastName.set('');
    this.paternalSurname.set('');
    this.maternalSurname.set('');
    this.birthDate.set('');
    this.notes.set('');
    this.photoUrl.set(null);
    this.resetExtendedFields();
    this.isDeceased.set(false);
    this.partnerSeparated.set(false);
    this.isPrimary.set(false);
    this.message.set('');
    this.modalOpen.set(true);
  }

  protected openEdit(member: FamilyMember): void {
    this.editingMemberId.set(member.id);
    this.formMode.set('root');
    this.parentId.set(null);
    this.firstName.set(member.firstName);
    this.lastName.set(member.lastName);
    this.paternalSurname.set(member.paternalSurname || member.lastName);
    this.maternalSurname.set(member.maternalSurname || '');
    this.birthDate.set(member.birthDate || '');
    this.notes.set(member.notes || '');
    this.photoUrl.set(member.photoUrl || null);
    this.birthPlace.set(member.birthPlace || '');
    this.residence.set(member.residence || '');
    this.deathDate.set(member.deathDate || '');
    this.burialPlace.set(member.burialPlace || '');
    this.biography.set(member.biography || '');
    this.profession.set(member.profession || '');
    this.phone.set(member.phone || '');
    this.email.set(member.email || '');
    this.socialLinks.set(member.socialLinks || '');
    this.isDeceased.set(member.isDeceased);
    this.partnerSeparated.set(this.partnerStatusOf(member.id) === 'separated');
    this.isPrimary.set(member.isPrimary);
    this.message.set('');
    this.modalOpen.set(true);
  }

  protected async saveMember(): Promise<void> {
    const firstName = this.firstName().trim();
    if (!firstName) {
      this.message.set('Ingresa al menos el nombre.');
      return;
    }

    try {
      const input = {
        parentId: this.parentId(),
        firstName,
        lastName: this.lastName().trim(),
        paternalSurname: this.paternalSurname().trim(),
        maternalSurname: this.maternalSurname().trim(),
        birthDate: this.birthDate() || null,
        notes: this.notes().trim() || null,
        photoUrl: this.photoUrl(),
        birthPlace: this.birthPlace().trim() || null,
        residence: this.residence().trim() || null,
        deathDate: this.deathDate() || null,
        burialPlace: this.burialPlace().trim() || null,
        biography: this.biography().trim() || null,
        profession: this.profession().trim() || null,
        phone: this.phone().trim() || null,
        email: this.email().trim() || null,
        socialLinks: this.socialLinks().trim() || null,
      };
      const editingId = this.editingMemberId();
      let savedMember;
      if (editingId) {
        await this.store.updateMember(this.editingMemberId()!, input);
        await this.store.setPersonDeceased(editingId, this.isDeceased());
        if (this.isPrimary()) await this.store.setPrimaryMember(editingId);
        if (this.partnerOf(editingId)) {
          await this.store.setPartnerStatus(editingId, this.partnerSeparated() ? 'separated' : 'together');
        }
      } else if (this.formMode() === 'parent' && this.parentId()) {
        savedMember = await this.store.addParent(this.parentId()!, input);
      } else if (this.formMode() === 'partner' && this.parentId()) {
        savedMember = await this.store.addPartner(this.parentId()!, input);
        if (this.partnerSeparated()) await this.store.setPartnerStatus(this.parentId()!, 'separated');
      } else {
        savedMember = await this.store.addMember(input);
      }
      if (savedMember) await this.store.setPersonDeceased(savedMember.id, this.isDeceased());
      if (savedMember && this.isPrimary()) await this.store.setPrimaryMember(savedMember.id);
      this.message.set(editingId ? 'Persona actualizada.' : this.formMode() === 'parent' ? 'Padre o madre agregado.' : this.formMode() === 'partner' ? 'Pareja agregada.' : this.parentId() ? 'Descendiente agregado.' : 'Persona raiz creada.');
      this.firstName.set('');
      this.lastName.set('');
      this.paternalSurname.set('');
      this.maternalSurname.set('');
      this.birthDate.set('');
      this.notes.set('');
      this.photoUrl.set(null);
      this.resetExtendedFields();
      this.isDeceased.set(false);
      this.partnerSeparated.set(false);
      this.isPrimary.set(false);
      this.parentId.set(null);
      this.formMode.set('root');
      this.editingMemberId.set(null);
      this.modalOpen.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'No se pudo guardar la persona.');
    }
  }

  protected cancelAdd(): void {
    this.parentId.set(null);
    this.formMode.set('root');
    this.firstName.set('');
    this.lastName.set('');
    this.paternalSurname.set('');
    this.maternalSurname.set('');
    this.birthDate.set('');
    this.notes.set('');
    this.photoUrl.set(null);
    this.resetExtendedFields();
    this.isDeceased.set(false);
    this.partnerSeparated.set(false);
    this.isPrimary.set(false);
    this.message.set('');
    this.editingMemberId.set(null);
    this.modalOpen.set(false);
  }

  protected fullName(member: FamilyMember): string {
    return `${member.firstName} ${member.paternalSurname || member.lastName} ${member.maternalSurname || ''}`.trim();
  }

  protected partnerOf(memberId: string): FamilyMember | undefined {
    const relationship = this.relationships().find((item) => item.memberAId === memberId || item.memberBId === memberId);
    if (!relationship) return undefined;
    const partnerId = relationship.memberAId === memberId ? relationship.memberBId : relationship.memberAId;
    return this.members().find((member) => member.id === partnerId);
  }

  protected partnerStatusOf(memberId: string): 'together' | 'separated' | undefined {
    return this.relationships().find((item) => item.memberAId === memberId || item.memberBId === memberId)?.status;
  }

  protected async toggleDeceased(member: FamilyMember): Promise<void> {
    await this.store.setPersonDeceased(member.id, !member.isDeceased);
  }

  protected async togglePartnerStatus(member: FamilyMember): Promise<void> {
    const status = this.partnerStatusOf(member.id);
    if (!status) return;
    await this.store.setPartnerStatus(member.id, status === 'together' ? 'separated' : 'together');
  }

  protected parentOf(member: FamilyMember): FamilyMember | undefined {
    return member.parentId ? this.members().find((item) => item.id === member.parentId) : undefined;
  }

  protected roleLabel(member: FamilyMember): string {
    const children = this.childrenOf(member.id);
    if (!member.parentId && children.length) {
      return `Padre/madre de ${this.fullName(children[0])}`;
    }
    if (member.parentId) {
      const parent = this.members().find((item) => item.id === member.parentId);
      return parent ? `Hijo/a de ${this.fullName(parent)}` : 'Descendiente';
    }
    return 'Persona raiz';
  }

  protected onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.photoUrl.set(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  protected initials(member: FamilyMember): string {
    return `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase() || '?';
  }

  protected openPhoto(member: FamilyMember, event: MouseEvent): void {
    event.stopPropagation();
    if (member.photoUrl) this.photoViewer.set(member);
  }

  protected closePhoto(): void {
    this.photoViewer.set(null);
  }

  protected async exportImage(): Promise<void> {
    const element = document.querySelector('.tree-panel') as HTMLElement | null;
    if (!element) return;
    const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
    const link = document.createElement('a');
    link.download = 'arbol-genealogico.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  protected exportPdf(): void {
    window.print();
  }

  private async generateShareQr(): Promise<void> {
    const base = environment.publicBaseUrl || `${location.origin}${location.pathname}`;
    const url = `${base.replace(/\/?$/, '/')}#/family/view`;
    this.shareUrl.set(url);
    this.shareQr.set(await QRCode.toDataURL(url, { margin: 1, width: 220 }));
  }

  private resetExtendedFields(): void {
    this.birthPlace.set(''); this.residence.set(''); this.deathDate.set(''); this.burialPlace.set('');
    this.biography.set(''); this.profession.set(''); this.phone.set(''); this.email.set(''); this.socialLinks.set('');
  }

  protected async deleteEditingMember(): Promise<void> {
    const memberId = this.editingMemberId();
    if (!memberId) return;
    const member = this.members().find((item) => item.id === memberId);
    if (!member || !confirm(`Eliminar a ${this.fullName(member)}? Esta accion no se puede deshacer.`)) return;
    try {
      await this.store.deleteMember(memberId);
      this.selectedMember.set(null);
      this.cancelAdd();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'No se pudo eliminar la persona.');
    }
  }
}

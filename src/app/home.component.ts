import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  protected readonly eventCode = signal('');

  constructor(private readonly router: Router) {}

  protected enterEvent(): void {
    const code = this.eventCode().trim().toUpperCase();
    if (!code) {
      return;
    }

    void this.router.navigate(['/event', code]);
  }
}

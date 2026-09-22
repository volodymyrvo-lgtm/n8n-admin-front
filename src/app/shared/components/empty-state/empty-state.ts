import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  imports: [],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
})
export class EmptyStateComponent {
  @Input({ required: true }) title!: string;
  @Input() description?: string;
}

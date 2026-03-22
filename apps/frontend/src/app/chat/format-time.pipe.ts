import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatTime' })
export class FormatTimePipe implements PipeTransform {
  transform(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

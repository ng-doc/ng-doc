import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'formatDate',
  standalone: true,
})
export class FormatDatePipe implements PipeTransform {
  /**
   * Transform pipe method
   *
   * @param value - ISO date string
   * @param display - Display format
   * @param utc - Determines if the date should be displayed in UTC
   */
  transform(value: string, display: 'date' | 'time' | 'datetime' = 'datetime', utc: boolean): string {
    const date: Date = new Date(value);
    const timeZone: 'UTC' | undefined = utc ? 'UTC' : undefined;

    if (display === 'date') {
      return date.toLocaleDateString('en-US', {timeZone});
    } else if (display === 'time') {
      return date.toLocaleTimeString('en-US', {timeZone});
    } else {
      return date.toLocaleString('en-US', {timeZone});
    }
  }
}

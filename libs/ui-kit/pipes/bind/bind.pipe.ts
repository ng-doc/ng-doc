import { Pipe, PipeTransform } from '@angular/core';
import { FunctionType } from '@ng-doc/core/types';

@Pipe({
  name: 'bind',
  standalone: true,
})
export class NgDocBindPipe implements PipeTransform {
  transform<R>(fn: FunctionType<R>, _this: unknown): FunctionType<R> {
    return fn.bind(_this);
  }
}

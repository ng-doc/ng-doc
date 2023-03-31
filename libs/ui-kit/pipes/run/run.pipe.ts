import { Pipe, PipeTransform } from '@angular/core';
import {FunctionType} from '@ng-doc/core';



@Pipe({
  name: 'ngDocRun'
})
export class NgDocRunPipe implements PipeTransform {

  transform<R, F extends FunctionType<R>>(fn: F, ...args: Parameters<F>): R {
    return fn(...args);
  }

}

import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  EventEmitter,
  HostBinding,
  inject,
  Injector,
  Input,
  OnChanges,
  Output,
  Renderer2,
  SimpleChanges,
  ViewContainerRef,
} from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { NgDocPageProcessor, NgDocProcessorOptions } from '@ng-doc/app/interfaces';
import { NG_DOC_PAGE_CUSTOM_PROCESSOR, NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { asArray, objectKeys } from '@ng-doc/core';

/**
 * Base processor class to create a processor directive that will be used to replace
 * html nodes with an Angular component.
 */
@Component({
  selector: '[ngDocPageProcessor]',
  standalone: true,
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageProcessorComponent implements OnChanges {
  @Input({ required: true, alias: 'ngDocPageProcessor' })
  @HostBinding('innerHTML')
  html: SafeHtml = '';

  @Output()
  afterRender: EventEmitter<void> = new EventEmitter<void>();

  processors: Array<NgDocPageProcessor<unknown>> =
    inject<Array<NgDocPageProcessor<unknown>>>(NG_DOC_PAGE_PROCESSOR, { optional: true }) ?? [];
  customProcessors: Array<NgDocPageProcessor<unknown>> =
    inject<Array<NgDocPageProcessor<unknown>>>(NG_DOC_PAGE_CUSTOM_PROCESSOR, { optional: true }) ??
    [];

  protected readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly viewContainerRef: ViewContainerRef = inject(ViewContainerRef);
  protected readonly applicationRef = inject(ApplicationRef);
  protected readonly injector: Injector = inject(Injector);
  protected readonly renderer: Renderer2 = inject(Renderer2);

  ngOnChanges({ html }: SimpleChanges): void {
    if (html) {
      Promise.resolve().then(() => {
        asArray(this.processors, this.customProcessors).forEach(this.process.bind(this));
        this.applicationRef.tick();
        this.afterRender.emit();
      });
    }
  }

  private process<T>(processor: NgDocPageProcessor<T>): void {
    Array.from(this.elementRef.nativeElement.querySelectorAll(processor.selector)).forEach(
      (elementNode: Element) => {
        // check if element node has a parent node because it can be removed by another processor
        if (elementNode.parentNode) {
          const replaceElement: Element =
            (processor.nodeToReplace && processor.nodeToReplace(elementNode, this.injector)) ??
            elementNode;
          const options: NgDocProcessorOptions<T> = processor.extractOptions(
            elementNode,
            this.elementRef.nativeElement,
          );

          // create component
          const componentRef: ComponentRef<T> = this.viewContainerRef.createComponent(
            processor.component,
            {
              projectableNodes: options.content,
              injector: this.injector,
            },
          );

          // set component options
          if (options.inputs) {
            objectKeys(options.inputs).forEach(
              (key: keyof T) =>
                options.inputs && componentRef.setInput(key as string, options.inputs[key]),
            );
          }

          // replace element node with component node
          replaceElement.parentNode?.replaceChild(
            componentRef.location.nativeElement,
            replaceElement,
          );

          componentRef.changeDetectorRef.markForCheck();
        }
      },
    );
  }
}

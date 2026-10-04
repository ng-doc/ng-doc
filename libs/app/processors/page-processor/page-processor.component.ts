import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  effect,
  ElementRef,
  ErrorHandler,
  inject,
  Injector,
  input,
  output,
  OutputRef,
  Renderer2,
  SecurityContext,
  untracked,
  ViewContainerRef,
} from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { NgDocContentRenderFailure } from '@ng-doc/app/classes/content-controller';
import type { NgDocPageProcessor, NgDocProcessorOptions } from '@ng-doc/app/interfaces';
import { NG_DOC_PAGE_CUSTOM_PROCESSOR, NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import { Subject } from 'rxjs';

/**
 * Renders HTML into its host element and replaces the nodes that the page processors
 * (`NG_DOC_PAGE_PROCESSOR`, `NG_DOC_PAGE_CUSTOM_PROCESSOR`) select with Angular components.
 *
 * Each change of the HTML or of `contentVersion` destroys the components of the previous pass
 * and schedules a new pass for the next microtask, after the HTML is in the DOM. A pass that a
 * newer change superseded, or that ends after the component is destroyed, emits nothing.
 */
@Component({
  selector: '[ngDocPageProcessor]',
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[innerHTML]': 'html()',
  },
})
export class NgDocPageProcessorComponent {
  /** The HTML to render and process. */
  readonly html = input<SafeHtml>('', { alias: 'ngDocPageProcessor' });

  /** Version of the HTML. A new version processes the HTML again, even when it is unchanged. */
  readonly contentVersion = input(0);

  /**
   * Emits the version of a pass after its components are created and before they render, in the
   * same task, so that a listener can reveal the content they will measure.
   * @internal
   */
  readonly beforeRender = output<number>();

  /** Emits after a pass has created its components and rendered them. */
  readonly afterRender = output<void>();

  /** Emits the version of each pass that completed. */
  readonly contentProcessed = output<number>();

  private readonly processingErrors = new Subject<NgDocContentRenderFailure>();

  /**
   * Emits the version and the error of a pass that a processor failed. Without a listener, the
   * error goes to the `ErrorHandler` instead.
   */
  // Built from a subject so the component can tell whether anything listens, which an
  // `output()` does not expose.
  readonly processingError: OutputRef<NgDocContentRenderFailure> = outputFromObservable(
    this.processingErrors,
  );

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
  protected readonly errorHandler = inject(ErrorHandler);

  private readonly sanitizer = inject(DomSanitizer);
  private scheduledVersion = 0;
  private scheduledHtml?: { readonly value: SafeHtml };
  private destroyed = false;

  constructor() {
    effect(() => {
      const html = this.html();
      const version = this.contentVersion();

      untracked(() => this.schedule(html, version));
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.scheduledVersion++;
      this.viewContainerRef.clear();
    });
  }

  private schedule(html: SafeHtml, version: number): void {
    const scheduled = ++this.scheduledVersion;
    const unchanged = this.scheduledHtml !== undefined && this.scheduledHtml.value === html;
    this.scheduledHtml = { value: html };
    // Clearing destroys the components of the previous pass, and with them the nodes they
    // replaced in the HTML.
    this.viewContainerRef.clear();
    if (unchanged) {
      // A new version of the same HTML (a retry): the host binding does not write an unchanged
      // value again, so restore the HTML here, sanitized the way the binding sanitizes it.
      this.renderer.setProperty(
        this.elementRef.nativeElement,
        'innerHTML',
        this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '',
      );
    }
    // A changed HTML is written by the host binding later in this change detection pass, so the
    // processors run once it is done.
    void Promise.resolve().then(() => {
      if (this.destroyed || scheduled !== this.scheduledVersion) return;
      try {
        asArray(this.processors, this.customProcessors).forEach(this.process.bind(this));
        if (this.destroyed || scheduled !== this.scheduledVersion) return;
        this.beforeRender.emit(version);
        this.applicationRef.tick();
        this.afterRender.emit();
        this.contentProcessed.emit(version);
      } catch (error) {
        if (!this.destroyed && scheduled === this.scheduledVersion) {
          if (this.processingErrors.observed) this.processingErrors.next({ version, error });
          else this.errorHandler.handleError(error);
        }
      }
    });
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

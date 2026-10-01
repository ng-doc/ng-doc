import {
  ChangeDetectionStrategy,
  Component,
  ErrorHandler,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-test-rendered',
  template: '<span>{{ value() }}</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RenderedComponent implements OnDestroy {
  static destroyed = 0;

  readonly value = input('');

  ngOnDestroy(): void {
    RenderedComponent.destroyed++;
  }
}

const processor: NgDocPageProcessor<RenderedComponent> = {
  component: RenderedComponent,
  selector: 'strong',
  extractOptions: (element) => ({
    inputs: { value: element.textContent ?? '' },
    content: [],
  }),
};

async function render(
  fixture: ComponentFixture<NgDocPageProcessorComponent>,
  html: string,
  version: number,
): Promise<void> {
  fixture.componentRef.setInput('ngDocPageProcessor', html);
  fixture.componentRef.setInput('contentVersion', version);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
}

@Component({
  selector: 'ng-doc-test-processor-host',
  imports: [NgDocPageProcessorComponent],
  template: `
    <div
      [ngDocPageProcessor]="html()"
      [contentVersion]="version()"
      (afterRender)="rendered.push(version())"
      (contentProcessed)="processed.push($event)"
      (processingError)="failed.push($event.version)"></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ProcessorHostComponent {
  readonly html = signal('<strong>one</strong>');
  readonly version = signal(1);
  readonly rendered: number[] = [];
  readonly processed: number[] = [];
  readonly failed: number[] = [];
}

describeChangeDetection('NgDocPageProcessorComponent replacement lifecycle', ({ providers }) => {
  let fixture: ComponentFixture<NgDocPageProcessorComponent>;

  beforeEach(async () => {
    RenderedComponent.destroyed = 0;
    await TestBed.configureTestingModule({
      imports: [NgDocPageProcessorComponent],
      providers: [
        ...providers,
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: processor, multi: true },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NgDocPageProcessorComponent);
  });

  it('destroys processor-owned views before installing replacement content', async () => {
    await render(fixture, '<strong>one</strong>', 1);
    expect(fixture.nativeElement.textContent).toContain('one');

    fixture.componentRef.setInput('ngDocPageProcessor', '<strong>two</strong>');
    fixture.componentRef.setInput('contentVersion', 2);
    fixture.detectChanges();
    expect(RenderedComponent.destroyed).toBe(1);
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('two');
  });

  it('suppresses a stale scheduled pass and emits readiness for only the current version', async () => {
    const completed: number[] = [];
    fixture.componentInstance.contentProcessed.subscribe((version) => completed.push(version));

    fixture.componentRef.setInput('ngDocPageProcessor', '<strong>stale</strong>');
    fixture.componentRef.setInput('contentVersion', 1);
    fixture.detectChanges();
    fixture.componentRef.setInput('ngDocPageProcessor', '<strong>current</strong>');
    fixture.componentRef.setInput('contentVersion', 2);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('current');
    expect(fixture.nativeElement.textContent).not.toContain('stale');
    expect(completed).toEqual([2]);
  });

  it('reports processor errors for the current pass and settles empty HTML', async () => {
    const error = new Error('processor failed');
    const errorHandler = { handleError: vi.fn() };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NgDocPageProcessorComponent],
      providers: [
        ...providers,
        {
          provide: NG_DOC_PAGE_PROCESSOR,
          useValue: {
            ...processor,
            extractOptions: () => {
              throw error;
            },
          },
          multi: true,
        },
        { provide: ErrorHandler, useValue: errorHandler },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NgDocPageProcessorComponent);
    const errors: unknown[] = [];
    fixture.componentInstance.processingError.subscribe((failure) => errors.push(failure.error));
    await render(fixture, '<strong>failure</strong>', 3);
    expect(errors).toEqual([error]);
    expect(errorHandler.handleError).not.toHaveBeenCalled();

    const legacy = TestBed.createComponent(NgDocPageProcessorComponent);
    await render(legacy, '<strong>legacy failure</strong>', 4);
    expect(errorHandler.handleError).toHaveBeenCalledWith(error);

    const destroyed = TestBed.createComponent(NgDocPageProcessorComponent);
    const lateErrors = vi.fn();
    destroyed.componentInstance.processingError.subscribe(lateErrors);
    destroyed.componentRef.setInput('ngDocPageProcessor', '<strong>late failure</strong>');
    destroyed.detectChanges();
    destroyed.destroy();
    await Promise.resolve();
    expect(lateErrors).not.toHaveBeenCalled();
    expect(errorHandler.handleError).toHaveBeenCalledTimes(1);

    const empty = TestBed.createComponent(NgDocPageProcessorComponent);
    const completed: number[] = [];
    empty.componentInstance.contentProcessed.subscribe((version) => completed.push(version));
    await render(empty, '', 5);
    expect(completed).toEqual([5]);
  });

  it('cancels scheduled processor work when destroyed', async () => {
    const completed = vi.fn();
    fixture.componentInstance.contentProcessed.subscribe(completed);
    fixture.componentRef.setInput('ngDocPageProcessor', '<strong>destroy</strong>');
    fixture.componentRef.setInput('contentVersion', 1);
    fixture.detectChanges();
    fixture.destroy();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
  });

  it('does not process again without a change of either input', async () => {
    const completed = vi.fn();
    fixture.componentInstance.contentProcessed.subscribe(completed);
    await render(fixture, '<strong>once</strong>', 1);
    expect(completed).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('ngDocPageProcessor', '<strong>once</strong>');
    fixture.componentRef.setInput('contentVersion', 1);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(RenderedComponent.destroyed).toBe(0);
  });

  it('processes the same HTML again for a new content version', async () => {
    const completed: number[] = [];
    fixture.componentInstance.contentProcessed.subscribe((version) => completed.push(version));
    await render(fixture, '<strong>same</strong>', 1);
    await render(fixture, '<strong>same</strong>', 2);

    expect(completed).toEqual([1, 2]);
    expect(RenderedComponent.destroyed).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('ng-doc-test-rendered')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('strong')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('same');
  });

  it('emits its outputs to template listeners without a manual change detection', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProcessorHostComponent],
      providers: [
        ...providers,
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: processor, multi: true },
      ],
    }).compileComponents();
    const host = TestBed.createComponent(ProcessorHostComponent);
    await host.whenStable();
    expect(host.nativeElement.textContent).toContain('one');
    expect(host.componentInstance.rendered).toEqual([1]);
    expect(host.componentInstance.processed).toEqual([1]);

    host.componentInstance.html.set('<strong>two</strong>');
    host.componentInstance.version.set(2);
    await host.whenStable();
    await Promise.resolve();
    await host.whenStable();

    expect(host.nativeElement.textContent).toContain('two');
    expect(host.nativeElement.textContent).not.toContain('one');
    expect(host.componentInstance.processed).toEqual([1, 2]);
    expect(host.componentInstance.failed).toEqual([]);
  });

  it('handles replacement nodes, missing inputs, and a node detached by an earlier match', async () => {
    TestBed.resetTestingModule();
    const detachingProcessor: NgDocPageProcessor<RenderedComponent> = {
      component: RenderedComponent,
      selector: 'strong',
      nodeToReplace: (element) => element.parentElement ?? element,
      extractOptions: (element, root) => {
        if (element.textContent === 'one') root.querySelectorAll('strong')[1]?.remove();
        return { content: [] };
      },
    };
    await TestBed.configureTestingModule({
      imports: [NgDocPageProcessorComponent],
      providers: [{ provide: NG_DOC_PAGE_PROCESSOR, useValue: detachingProcessor, multi: true }],
    }).compileComponents();
    fixture = TestBed.createComponent(NgDocPageProcessorComponent);
    await render(fixture, '<div><strong>one</strong><strong>two</strong></div>', 1);

    expect(fixture.nativeElement.querySelectorAll('ng-doc-test-rendered')).toHaveLength(1);
  });
});

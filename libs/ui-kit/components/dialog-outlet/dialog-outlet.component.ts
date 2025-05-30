import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  DestroyRef,
  inject,
  Input,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes/overlay-ref';
import { NgDocDialogConfig, NgDocDialogService } from '@ng-doc/ui-kit/services/dialog';
import { merge, NEVER, Subject, switchMap } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'ng-doc-dialog-outlet',
  standalone: true,
  template: `
    <ng-template #outletContent>
      <ng-content></ng-content>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogOutletComponent implements AfterContentInit {
  @Input()
  config?: NgDocDialogConfig;

  @ViewChild('outletContent', { static: true })
  outletContent!: TemplateRef<never>;

  @ContentChild(RouterOutlet)
  routerOutlet?: RouterOutlet;

  dialogRef?: NgDocOverlayRef;

  protected readonly router: Router = inject(Router);
  protected readonly route: ActivatedRoute = inject(ActivatedRoute);
  protected readonly dialogService: NgDocDialogService = inject(NgDocDialogService);
  protected readonly destroyRef = inject(DestroyRef);

  ngAfterContentInit(): void {
    if (this.routerOutlet) {
      const dialogRef = new Subject<NgDocOverlayRef>();

      dialogRef
        .pipe(
          switchMap((dialogRef: NgDocOverlayRef) =>
            dialogRef.beforeClose().pipe(takeUntil(this.routerOutlet?.deactivateEvents ?? NEVER)),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          const url = this.route.pathFromRoot
            .map((r) => r.snapshot.url)
            .filter((f) => !!f[0])
            .map(([f]) => f.path)
            .join('/');

          this.router.navigateByUrl(url);
        });

      merge(
        this.routerOutlet.activateEvents.pipe(map(() => true)),
        this.routerOutlet.deactivateEvents.pipe(map(() => false)),
      )
        .pipe(startWith(this.routerOutlet.isActivated), takeUntilDestroyed(this.destroyRef))
        .subscribe((activated: boolean) => {
          if (activated) {
            this.dialogRef = this.dialogService.open(this.outletContent, this.config);

            dialogRef.next(this.dialogRef);
          } else {
            this.dialogRef?.close();
          }
        });
    }
  }
}

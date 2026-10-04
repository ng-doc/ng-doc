import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { expect, it, vi } from 'vitest';

import { ObservableSet } from '../../classes/observable-set';
import { onDependenciesChange } from '../../engine/core/triggers/on-dependencies-change';
const events = new Subject<{ path: string; type: string }>();
vi.mock('../../engine/core/watcher', () => ({
  watchFile: (path: string, type?: string) =>
    events.pipe(filter((event) => event.path === path && (!type || event.type === type))),
}));
it('dependency existence changes invalidate and replaced dependencies unsubscribe', () => {
  const dependencies = new ObservableSet(['/missing.html']);
  const invalidate = vi.fn();
  const subscription = onDependenciesChange(dependencies).subscribe(invalidate);
  try {
    for (const type of ['create', 'update', 'delete']) events.next({ path: '/missing.html', type });
    expect(invalidate).toHaveBeenCalledTimes(3);
    dependencies.fill('/new.css');
    events.next({ path: '/missing.html', type: 'create' });
    expect(invalidate).toHaveBeenCalledTimes(3);
    events.next({ path: '/new.css', type: 'create' });
    expect(invalidate).toHaveBeenCalledTimes(4);
  } finally {
    subscription.unsubscribe();
  }
});

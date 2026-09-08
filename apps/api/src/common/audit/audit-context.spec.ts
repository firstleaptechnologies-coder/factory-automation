import { currentActor, currentAuditNote, runAsActor, withAuditNote } from './audit-context';

describe('who', () => {
  it('holds the actor for everything inside the call', async () => {
    await runAsActor({ userId: 'u1', name: 'Rajat' }, async () => {
      await Promise.resolve();
      expect(currentActor()).toEqual({ userId: 'u1', name: 'Rajat' });
    });
    expect(currentActor()).toBeUndefined();
  });
});

describe('why', () => {
  it('reaches work that only starts when it is awaited', async () => {
    /*
     * A Prisma promise does nothing until awaited. If the note were left to
     * whatever awaits the callback, every reason would be attached to nothing —
     * which is what happened before this was fixed.
     */
    let noteWhenRun: unknown;
    const lazy: PromiseLike<string> = {
      then(onfulfilled) {
        noteWhenRun = currentAuditNote();
        return Promise.resolve(onfulfilled ? onfulfilled('done') : ('done' as never));
      },
    };

    await withAuditNote({ reason: 'Client changed the design' }, () => lazy);

    expect(noteWhenRun).toEqual({ reason: 'Client changed the design' });
  });

  it('keeps an outer reason when an inner call names the action', async () => {
    await withAuditNote({ reason: 'Client changed the design' }, async () => {
      await withAuditNote({ action: 'order.moved_back' }, async () => {
        expect(currentAuditNote()).toEqual({
          reason: 'Client changed the design',
          action: 'order.moved_back',
        });
      });
    });
  });

  it('holds nothing once the call is over', async () => {
    await withAuditNote({ reason: 'x' }, async () => undefined);
    expect(currentAuditNote()).toBeUndefined();
  });
});

import { AsyncLocalStorage } from 'node:async_hooks';

/** Who is making the change. Read off the verified token, never off a header. */
export interface Actor {
  userId?: string;
  /** The staff code, so a log line reads without a join. */
  code?: string;
  name?: string;
  /** Where it came from: 'web', 'app', or the deployment's own name. */
  platform?: string;
}

/**
 * Who did it, and why.
 *
 * The audit trail is written underneath every service by a Prisma extension —
 * nothing has to remember to call it — which means the writer has no arguments
 * to read the actor from. So it comes from here, put in place once per request,
 * the same way the tenant does.
 */
const actors = new AsyncLocalStorage<Actor>();

export function runAsActor<T>(actor: Actor, fn: () => T): T {
  return actors.run(actor, fn);
}

export function currentActor(): Actor | undefined {
  return actors.getStore();
}

/** A sentence explaining a change, and optionally a better name for it. */
export interface AuditNote {
  /** Free text from the person making the change: "client changed the design". */
  reason?: string;
  /**
   * A verb for what happened, when "updated" is a poor description of it —
   * `order.moved_back`, `payment.reversed`. The row is the same row either way.
   */
  action?: string;
}

const notes = new AsyncLocalStorage<AuditNote>();

/**
 * Say why the writes inside this call are happening.
 *
 * A diff answers what changed. Half the value of a history is the half a diff
 * cannot hold — that this order went back a stage because the client changed
 * their mind, not because someone mis-tapped.
 */
export async function withAuditNote<T>(
  note: AuditNote,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  /*
   * `await fn()` rather than handing the callback straight to `run`.
   *
   * A Prisma promise is lazy: it does nothing until something awaits it. Handed
   * back unawaited, it would start running after this context had already been
   * left, and the note would be attached to nothing — which is exactly what
   * happened the first time this was written, and the reason the spec below
   * uses a thenable that only fires on await.
   */
  return notes.run({ ...currentAuditNote(), ...note }, async () => await fn());
}

export function currentAuditNote(): AuditNote | undefined {
  return notes.getStore();
}

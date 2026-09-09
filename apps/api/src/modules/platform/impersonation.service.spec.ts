import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ImpersonationService, SESSION } from './impersonation.service';
import { prismaMock } from '../../../test/prisma-mock';
import { ALL_MODULES } from '@fas/shared';

type Db = Record<string, Record<string, jest.Mock>>;

const WORKSPACE = {
  id: 't1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: 'ACTIVE',
};

const CONTEXT = {
  tenantId: 't1',
  slug: 'decorbucket',
  isolation: 'SHARED',
  databaseUrl: null,
  modules: ALL_MODULES,
};

function build(options: { workspace?: unknown; account?: unknown } = {}) {
  const db = prismaMock() as never as Db;
  // `??` would treat an explicit null as "not given", which is the case
  // this very test needs.
  db.tenant.findUnique = jest.fn(async () =>
    options.workspace === undefined ? WORKSPACE : options.workspace,
  );
  db.user.findFirst = jest.fn(async () =>
    options.account === undefined
      ? { id: 'u1', name: 'Administrator', code: 'ADMIN', role: 'ADMIN' }
      : options.account,
  );
  const registry = { byIdOrThrow: jest.fn(async () => CONTEXT) };
  const jwt = { signAsync: jest.fn(async (..._args: unknown[]) => 'a-short-lived-token') };
  return {
    service: new ImpersonationService(db as never, registry as never, jwt as never),
    db,
    jwt,
  };
}

const REASON = 'Their board is not loading and they are on the phone';
const actor = { id: 'p1', name: 'Nakul' };

describe('opening a workspace to help', () => {
  it('hands back a token for their own admin', async () => {
    const { service, jwt } = build();
    const session = await service.start('t1', REASON, actor);

    expect(session.accessToken).toBe('a-short-lived-token');
    expect(session.as).toBe('Administrator');
    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ sub: 'u1', tenantId: 't1' });
  });

  it('signs who is really doing it into the token', async () => {
    const { service, jwt } = build();
    await service.start('t1', REASON, actor);

    // The trail, the log and the screen all read off this.
    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({
      impersonatedBy: { id: 'p1', name: 'Nakul' },
    });
  });

  it('expires, because a token that cannot be revoked has to', async () => {
    const { service, jwt } = build();
    await service.start('t1', REASON, actor);
    expect(jwt.signAsync.mock.calls[0][1]).toEqual({ expiresIn: SESSION });
  });

  it('refuses without a reason worth reading', async () => {
    const { service } = build();
    // The shop reads this sentence in their own history months later.
    await expect(service.start('t1', 'help', actor)).rejects.toThrow(BadRequestException);
    await expect(service.start('t1', '   ', actor)).rejects.toThrow(/Say why/);
  });

  it('writes it into the shop’s own history, not only ours', async () => {
    const { service, db } = build();
    await service.start('t1', REASON, actor);

    const entry = db.auditLog.create.mock.calls[0][0].data;
    expect(entry).toMatchObject({
      action: 'workspace.opened_by_support',
      reason: REASON,
      actorLabel: 'Nakul (FirstLeap support)',
    });
  });

  it('does not open it at all if that cannot be recorded', async () => {
    const { service, db } = build();
    db.auditLog.create = jest.fn(async () => {
      throw new Error('their database is unreachable');
    });

    // The whole point is that they can see it.
    await expect(service.start('t1', REASON, actor)).rejects.toThrow(ForbiddenException);
  });

  it('refuses a workspace that is not there', async () => {
    const { service } = build({ workspace: null });
    await expect(service.start('nope', REASON, actor)).rejects.toThrow(NotFoundException);
  });

  it('refuses a suspended workspace', async () => {
    const { service } = build({ workspace: { ...WORKSPACE, status: 'SUSPENDED' } });
    await expect(service.start('t1', REASON, actor)).rejects.toThrow(/suspended/);
  });

  it('refuses when there is no account to borrow', async () => {
    const { service } = build({ account: null });
    // An account of our own inside their workspace would be a second thing to
    // secure, and could do what nobody they employ can do.
    await expect(service.start('t1', REASON, actor)).rejects.toThrow(/no active administrator/);
  });

  it('borrows the longest-standing administrator, not just anybody', async () => {
    const { service, db } = build();
    await service.start('t1', REASON, actor);

    expect(db.user.findFirst.mock.calls[0][0]).toMatchObject({
      where: { isActive: true, role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

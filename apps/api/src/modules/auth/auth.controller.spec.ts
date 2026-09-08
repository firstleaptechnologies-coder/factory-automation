import { AuthController } from './auth.controller';

const auth = {
  lookupWorkspace: jest.fn(async (..._a: unknown[]) => ({ exists: true, slug: 'decorbucket' })),
  login: jest.fn(async (..._a: unknown[]) => ({ accessToken: 't' })),
  platformLogin: jest.fn(async (..._a: unknown[]) => ({ accessToken: 'p' })),
  me: jest.fn(async (..._a: unknown[]) => ({ id: 'u1' })),
};

const controller = new AuthController(auth as never);

beforeEach(() => jest.clearAllMocks());

it('looks a workspace up by the slug alone', async () => {
  // Checked before a password is asked for, so a typo is caught while it is
  // still obvious what went wrong.
  await controller.lookup({ workspace: 'decorbucket' } as never);
  expect(auth.lookupWorkspace).toHaveBeenCalledWith('decorbucket');
});

it('signs in against a named workspace', async () => {
  const dto = { workspace: 'decorbucket', identifier: 'ADMIN', password: 'secret' };
  await controller.login(dto as never);
  expect(auth.login).toHaveBeenCalledWith(dto);
});

it('signs a platform administrator in separately, with no workspace', async () => {
  const dto = { email: 'admin@decorbucket.app', password: 'secret' };
  await controller.platformLogin(dto as never);
  expect(auth.platformLogin).toHaveBeenCalledWith(dto);
  expect(auth.login).not.toHaveBeenCalled();
});

it('answers who the caller is from the token, not from the body', async () => {
  const user = { id: 'u1', code: 'ADMIN' };
  await controller.me(user as never);
  expect(auth.me).toHaveBeenCalledWith(user);
});

import { landingFor } from './nav';

it('sends somebody signed in to a shop to the shop', () => {
  expect(landingFor({ isPlatform: false })).toBe('/');
});

it('sends a platform administrator to the control plane', () => {
  // They belong to no workspace, so a shop's screens have no tenant to read.
  expect(landingFor({ isPlatform: true })).toBe('/platform/tenants');
});

it('treats a user with nothing said about it as a shop user', () => {
  expect(landingFor({})).toBe('/');
});

it('sends nobody anywhere while nobody is signed in', () => {
  expect(landingFor(null)).toBeNull();
  expect(landingFor(undefined)).toBeNull();
});

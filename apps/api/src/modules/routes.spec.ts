import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DEFAULT_ROLES } from '@decor/shared';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

import { AuthController } from './auth/auth.controller';
import { ClientsController } from './clients/clients.controller';
import { ConfigurationController } from './config/config.controller';
import { DisbursementsController } from './disbursements/disbursements.controller';
import { EstimatesController } from './estimates/estimates.controller';
import { FilesController } from './files/files.controller';
import { HealthController } from './health/health.controller';
import { LeadsController } from './leads/leads.controller';
import { OrdersController } from './orders/orders.controller';
import { PaymentsController } from './payments/payments.controller';
import { PlatformController } from './platform/platform.controller';
import { UsersController } from './users/users.controller';
import { WorkflowsController } from './workflows/workflows.controller';

/**
 * The API's own wiring, read off the decorators.
 *
 * A route that quietly loses its permission decorator is not something any
 * service test would notice — the service would still refuse nothing, because
 * refusing is the guard's job. So the guard metadata is asserted here, for
 * every route the API exposes.
 */
const CONTROLLERS = [
  AuthController,
  ClientsController,
  ConfigurationController,
  DisbursementsController,
  EstimatesController,
  FilesController,
  HealthController,
  LeadsController,
  OrdersController,
  PaymentsController,
  PlatformController,
  UsersController,
  WorkflowsController,
];

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

interface Route {
  controller: string;
  handler: string;
  method: string;
  path: string;
  permissions: string[];
  roles: string[];
  isPublic: boolean;
}

const routes: Route[] = CONTROLLERS.flatMap((controller) => {
  const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const prototype = controller.prototype as unknown as Record<string, object>;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .filter((name) => Reflect.hasMetadata(METHOD_METADATA, prototype[name]))
    .map((name) => ({
      controller: controller.name,
      handler: name,
      method: METHOD_NAME[Reflect.getMetadata(METHOD_METADATA, prototype[name]) as number],
      path: `/${base}/${Reflect.getMetadata(PATH_METADATA, prototype[name]) ?? ''}`.replace(/\/+$/, ''),
      // A guard reads the handler first and the controller as a fallback, so
      // a class-level rule counts for every route under it.
      permissions:
        (Reflect.getMetadata(PERMISSIONS_KEY, prototype[name]) as string[]) ??
        (Reflect.getMetadata(PERMISSIONS_KEY, controller) as string[]) ??
        [],
      roles:
        (Reflect.getMetadata(ROLES_KEY, prototype[name]) as string[]) ??
        (Reflect.getMetadata(ROLES_KEY, controller) as string[]) ??
        [],
      isPublic:
        Boolean(Reflect.getMetadata(IS_PUBLIC_KEY, prototype[name])) ||
        Boolean(Reflect.getMetadata(IS_PUBLIC_KEY, controller)),
    }));
});

const find = (controller: string, handler: string) =>
  routes.find((route) => route.controller === controller && route.handler === handler)!;

it('found every controller’s routes', () => {
  expect(routes.length).toBeGreaterThan(60);
  expect(new Set(routes.map((r) => r.controller)).size).toBe(CONTROLLERS.length);
});

it('rate-limits every way in', () => {
  const prototype = AuthController.prototype as unknown as Record<string, object>;
  const guardsOn = (handler: string) =>
    ((Reflect.getMetadata(GUARDS_METADATA, prototype[handler]) as { name: string }[]) ?? [])
      .map((guard) => guard.name);

  // The three doors that open without a token. A password list works through
  // them at whatever speed it is allowed to.
  for (const handler of ['lookup', 'login', 'platformLogin']) {
    expect(guardsOn(handler)).toContain('ThrottlerGuard');
  }
  // And not on the rest: the apps poll /auth/me and being told to slow down
  // mid-shift reads as the product being broken.
  expect(guardsOn('me')).toEqual([]);
});

it('leaves nothing but signing in reachable without a token', () => {
  const open = routes.filter((route) => route.isPublic);
  // Everything else runs behind the JWT guard, which is global.
  expect(open.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
    // Whether this instance is alive is not a secret, and a load balancer
    // asking has no token to offer.
    'GET /health',
    'POST /auth/login',
    'POST /auth/platform/login',
    'POST /auth/workspace',
  ]);
});

describe('money', () => {
  it('guards every money route by permission, never by a role name', () => {
    // Roles are a tenant's to rename and recombine; the permissions on them
    // are what the product is written against.
    const money = routes.filter((route) => route.controller === 'PaymentsController');
    expect(money.length).toBe(7);
    for (const route of money) {
      expect(route.permissions.length).toBeGreaterThan(0);
      expect(route.roles).toEqual([]);
    }
  });

  it('separates seeing money from taking it', () => {
    expect(find('PaymentsController', 'summary').permissions).toEqual(['payment.view']);
    expect(find('PaymentsController', 'record').permissions).toEqual(['payment.record']);
  });

  it('guards banking collected cash apart from taking it', () => {
    // Taking money and saying where it went are different jobs, and the
    // default Sales role is granted only the first.
    expect(find('PaymentsController', 'deposit').permissions).toEqual(['payment.deposit']);
  });

  it('keeps the shop’s float behind its own permission', () => {
    expect(find('PaymentsController', 'cashPosition').permissions).toEqual([
      'payment.cash_position',
    ]);
    expect(find('PaymentsController', 'cashInHand').permissions).toEqual([
      'payment.cash_position',
    ]);
  });

  it('guards deleting a receipt more tightly than taking one', () => {
    // Not even the default Manager role carries this one.
    expect(find('PaymentsController', 'remove').permissions).toEqual(['payment.delete']);
  });

  it('guards reading and writing payouts apart', () => {
    expect(find('DisbursementsController', 'ledger').permissions).toEqual(['disbursement.view']);
    expect(find('DisbursementsController', 'create').permissions).toEqual(['disbursement.manage']);
    expect(find('DisbursementsController', 'settle').permissions).toEqual(['disbursement.manage']);
  });

  it('guards every payout route, since the ledger is money leaving', () => {
    const payouts = routes.filter((route) => route.controller === 'DisbursementsController');
    expect(payouts.length).toBeGreaterThan(5);
    for (const route of payouts) {
      expect(route.permissions.length).toBeGreaterThan(0);
    }
  });

  it('guards re-stating an order’s terms, which changes what is owed', () => {
    expect(find('OrdersController', 'reprice').permissions).toEqual(['order.terms']);
  });
});

describe('what the roles a shop starts with can reach', () => {
  const granted = new Map(
    DEFAULT_ROLES.map((role) => [role.code, new Set<string>(role.permissions)]),
  );

  /** Whether a role, as seeded, satisfies a route's permissions. */
  const may = (roleCode: string, controller: string, handler: string) => {
    const route = find(controller, handler);
    const held = granted.get(roleCode)!;
    return route.permissions.every((permission) => held.has(permission));
  };

  it('lets the owner do everything with money', () => {
    for (const handler of ['summary', 'record', 'deposit', 'remove', 'cashPosition']) {
      expect(may('OWNER', 'PaymentsController', handler)).toBe(true);
    }
  });

  it('lets sales take a payment but not bank it', () => {
    // "Punches orders, works leads, takes payments" — banking it is a
    // different job, and the API now agrees with the role that says so.
    expect(may('SALES', 'PaymentsController', 'record')).toBe(true);
    expect(may('SALES', 'PaymentsController', 'deposit')).toBe(false);
    expect(may('SALES', 'PaymentsController', 'cashPosition')).toBe(false);
  });

  it('keeps money away from the floor entirely', () => {
    for (const handler of ['summary', 'record', 'deposit', 'cashPosition']) {
      expect(may('PRODUCTION', 'PaymentsController', handler)).toBe(false);
    }
  });

  it('lets the floor move work along, which is its whole job', () => {
    expect(may('PRODUCTION', 'OrdersController', 'changeStatus')).toBe(true);
    expect(may('PRODUCTION', 'LeadsController', 'changeStatus')).toBe(false);
  });

  it('lets a manager run the shop but not delete a receipt', () => {
    expect(may('MANAGER', 'PaymentsController', 'deposit')).toBe(true);
    expect(may('MANAGER', 'PaymentsController', 'cashPosition')).toBe(true);
    // The one thing the seeded Manager is deliberately not given.
    expect(may('MANAGER', 'PaymentsController', 'remove')).toBe(false);
  });

  it('keeps payouts to whoever the shop trusts with them', () => {
    expect(may('OWNER', 'DisbursementsController', 'create')).toBe(true);
    expect(may('PRODUCTION', 'DisbursementsController', 'ledger')).toBe(false);
  });
});

describe('moving work along', () => {
  it('asks for the permission the apps already check, on orders', () => {
    // Otherwise any signed-in person could move an order however the apps
    // hid the button.
    expect(find('OrdersController', 'changeStatus').permissions).toEqual(['order.move_status']);
  });

  it('asks for it on leads too', () => {
    expect(find('LeadsController', 'changeStatus').permissions).toEqual(['lead.move_status']);
  });
});

describe('configuration', () => {
  it('lets anybody read the shop’s configuration, since punching needs it', () => {
    const reads = ['listMaterials', 'listSizePresets', 'listGstSlabs'];
    for (const handler of reads) {
      const route = find('ConfigurationController', handler);
      expect(route.permissions.length + route.roles.length).toBe(0);
    }
  });

  it('guards every change to it', () => {
    const writes = routes.filter(
      (route) => route.controller === 'ConfigurationController' && route.method !== 'GET',
    );
    expect(writes.length).toBeGreaterThan(5);
    for (const route of writes) {
      expect(route.roles).toEqual(['ADMIN']);
    }
  });

  it('guards the firm’s own details, which print on every document', () => {
    expect(find('EstimatesController', 'saveFirm').permissions).toEqual(['config.manage']);
    expect(find('EstimatesController', 'firm').permissions).toEqual(['config.view']);
  });

  it('leaves the theme readable, since the apps paint themselves with it', () => {
    expect(find('EstimatesController', 'theme').permissions).toEqual([]);
  });

  it('guards changing the flow itself, expiry and all', () => {
    expect(find('WorkflowsController', 'update').roles).toEqual(['ADMIN']);
  });

  it('guards which stages the home screen counts', () => {
    expect(find('WorkflowsController', 'setHomeCard').roles).toEqual(['ADMIN']);
  });

  it('guards editing the status flow the API enforces', () => {
    const writes = routes.filter(
      (route) => route.controller === 'WorkflowsController' && route.method !== 'GET',
    );
    expect(writes.length).toBeGreaterThan(2);
    for (const route of writes) {
      expect(route.roles).toEqual(['ADMIN']);
    }
  });
});

describe('estimates', () => {
  it('separates reading a quote from writing one', () => {
    expect(find('EstimatesController', 'list').permissions).toEqual(['estimate.view']);
    expect(find('EstimatesController', 'create').permissions).toEqual(['estimate.manage']);
  });

  it('demands both permissions to turn a quote into an order', () => {
    // It writes an order as well as closing the estimate.
    expect(find('EstimatesController', 'convert').permissions).toEqual([
      'estimate.manage',
      'order.punch',
    ]);
  });
});

describe('the control plane', () => {
  it('is guarded on every route, not only where a workspace is created', () => {
    const platform = routes.filter((route) => route.controller === 'PlatformController');
    expect(platform.length).toBeGreaterThan(0);
    for (const route of platform) {
      expect(route.permissions.some((p) => p.startsWith('platform.'))).toBe(true);
    }
  });

  it('separates looking at a workspace from changing one', () => {
    expect(find('PlatformController', 'list').permissions).toEqual(['platform.tenant.view']);
    expect(find('PlatformController', 'create').permissions).toEqual(['platform.tenant.manage']);
  });
});

describe('everything that changes something', () => {
  const mutating = routes.filter(
    (route) => route.method !== 'GET' && !route.isPublic,
  );

  it('is not a short list', () => {
    expect(mutating.length).toBeGreaterThan(25);
  });

  it.each(mutating.map((route) => [`${route.controller}.${route.handler}`, route]))(
    '%s says who may call it',
    (_name, route) => {
      // A write with no permission and no role is open to every signed-in
      // person in the workspace, whatever they were hired to do.
      expect(route.permissions.length + route.roles.length).toBeGreaterThan(0);
    },
  );
});

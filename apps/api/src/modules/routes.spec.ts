import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DEFAULT_ROLES, PLATFORM_ROLES } from '@fas/shared';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { MODULE_KEY } from '../common/decorators/module.decorator';

import { AuthController } from './auth/auth.controller';
import { ClientsController } from './clients/clients.controller';
import { ConfigurationController } from './config/config.controller';
import { DisbursementsController } from './disbursements/disbursements.controller';
import { EstimatesController } from './estimates/estimates.controller';
import { FilesController } from './files/files.controller';
import { HealthController } from './health/health.controller';
import { HistoryController } from './history/history.controller';
import { LogsController } from './logs/logs.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { UpdatesController } from './ota/updates.controller';
import { ReleasesController } from './ota/releases.controller';
import { LeadsController } from './leads/leads.controller';
import { OrdersController } from './orders/orders.controller';
import { PaymentsController } from './payments/payments.controller';
import { PlatformController } from './platform/platform.controller';
import { PlatformBillingController } from './platform/billing.controller';
import { ReportsController } from './reports/reports.controller';
import { UsersController } from './users/users.controller';
import { WorkflowsController } from './workflows/workflows.controller';
import { ExpensesController } from './expenses/expenses.controller';
import { EmployeesController } from './employees/employees.controller';
import { AttendanceController } from './attendance/attendance.controller';
import { PayrollController } from './payroll/payroll.controller';
import { RolesController } from './roles/roles.controller';
import { LettersController } from './letters/letters.controller';
import { VendorsController } from './vendors/vendors.controller';
import { PurchasesController } from './purchases/purchases.controller';
import { DocumentsController } from './documents/documents.controller';

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
  HistoryController,
  LogsController,
  NotificationsController,
  UpdatesController,
  ReleasesController,
  LeadsController,
  OrdersController,
  PaymentsController,
  PlatformController,
  PlatformBillingController,
  ReportsController,
  UsersController,
  WorkflowsController,
  ExpensesController,
  EmployeesController,
  AttendanceController,
  PayrollController,
  RolesController,
  LettersController,
  VendorsController,
  PurchasesController,
  DocumentsController,
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
  /** What the workspace must have bought, where the route says. */
  module?: string;
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
      // A controller with no prefix of its own leaves an empty segment, so
      // repeated slashes are collapsed rather than shown to anyone.
      path: `/${base}/${Reflect.getMetadata(PATH_METADATA, prototype[name]) ?? ''}`
        .replace(/\/+/g, '/')
        .replace(/\/+$/, ''),
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
      module:
        (Reflect.getMetadata(MODULE_KEY, prototype[name]) as string) ??
        (Reflect.getMetadata(MODULE_KEY, controller) as string),
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
    // The phone asking what to run has not signed in — it may have no account
    // on it at all — and what it gets is the same signed code the stores hand
    // out. Nothing here reads or returns a shop's data.
    'GET /app/version-check',
    // Whether this instance is alive is not a secret, and a load balancer
    // asking has no token to offer.
    'GET /health',
    'GET /updates/assets/:id',
    'GET /updates/manifest',
    'POST /auth/login',
    'POST /auth/platform/login',
    'POST /auth/workspace',
    /*
     * Razorpay calling us. It holds no token of ours and never will, so the
     * route is public and trusted for exactly one reason: it carries a
     * signature over the raw bytes it sent, checked against a secret only we
     * and Razorpay have, before the body is read at all. See
     * RazorpayService.verifyWebhook and the controller's own spec.
     */
    'POST /platform/billing/razorpay/webhook',
  ]);
});

/*
 * The rail's own rail.
 *
 * `CONTROLLERS` is a list somebody maintains, and every check in this file
 * only sees what is on it — so a controller added and not listed escapes all
 * of them silently, which is precisely the failure this file exists to catch.
 * Read off disk instead, so forgetting is a red test rather than a quiet gap.
 */
it('knows about every controller in the tree', () => {
  const root = join(__dirname);
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.controller.ts')) continue;
      for (const match of readFileSync(path, 'utf8').matchAll(/export class (\w+Controller)/g)) {
        found.push(match[1]);
      }
    }
  };
  walk(root);

  const listed = new Set(CONTROLLERS.map((one) => one.name));
  const missing = found.filter((name) => !listed.has(name));

  expect(missing).toEqual([]);
});

it('takes what the clients saw behind a token, and slowly', () => {
  const prototype = LogsController.prototype as unknown as Record<string, object>;
  const guards = ((Reflect.getMetadata(GUARDS_METADATA, prototype.record) as { name: string }[]) ?? [])
    .map((guard) => guard.name);

  // An anonymous endpoint that accepts arbitrary text is a free place to write
  // into somebody else's database, and a client stuck in a crash loop should
  // not be able to fill the table while it is at it.
  expect(find('LogsController', 'record').isPublic).toBe(false);
  expect(guards).toContain('ThrottlerGuard');
});

describe('the platform’s own powers', () => {
  it('holds opening a workspace apart from everything else', () => {
    // It is the one platform power that reaches inside a shop's data, and it
    // should be possible to hand somebody the release console without it.
    expect(find('PlatformController', 'open').permissions).toEqual(['platform.impersonate']);
  });

  it('gives that to support and to nobody else by default', () => {
    const holders = PLATFORM_ROLES.filter((role) =>
      role.permissions.includes('platform.impersonate' as never),
    ).map((role) => role.key);

    expect(holders).toEqual(['OWNER', 'SUPPORT']);
  });

  it('keeps billing and engineering out of a shop’s data', () => {
    for (const key of ['BILLING', 'ENGINEER']) {
      const role = PLATFORM_ROLES.find((one) => one.key === key)!;
      expect(role.permissions).not.toContain('platform.impersonate');
    }
  });

  it('grants no platform power to any of a tenant’s roles', () => {
    for (const role of DEFAULT_ROLES) {
      expect(role.permissions.some((one) => one.startsWith('platform.'))).toBe(false);
    }
  });
});

describe('what a plan reaches', () => {
  it('marks the modules that are sold separately', () => {
    // The plan decides what the business bought; the role decides who inside
    // it may touch it. Both gates, on the same routes.
    expect(find('LeadsController', 'list').module).toBe('leads');
    expect(find('PaymentsController', 'summary').module).toBe('finance');
    expect(find('DisbursementsController', 'ledger').module).toBe('finance');
    expect(find('OrdersController', 'list').module).toBe('orders');
    expect(find('ClientsController', 'list').module).toBe('clients');
    expect(find('EstimatesController', 'list').module).toBe('quotes');
  });

  it('leaves the firm’s own details outside every plan', () => {
    // A letterhead is not a module anybody buys; it is the shop's own name on
    // its own paper.
    expect(find('EstimatesController', 'firm').module).toBeUndefined();
  });

  it('leaves the platform’s own screens out of it', () => {
    // The control plane sells the modules; it is not inside a plan.
    expect(find('PlatformController', 'list').module).toBeUndefined();
    expect(find('ReleasesController', 'list').module).toBeUndefined();
  });
});

describe('notifications', () => {
  it('lets anybody read their own, and nobody read another’s', () => {
    // The service scopes every query to the caller, so there is nothing here
    // for a permission to protect.
    expect(find('NotificationsController', 'mine').permissions).toEqual([]);
    expect(find('NotificationsController', 'unread').permissions).toEqual([]);
  });

  it('keeps the wording behind the configuration permissions', () => {
    // What the shop says to itself is a shop-wide setting, not a personal one.
    expect(find('NotificationsController', 'settings').permissions).toEqual(['config.view']);
    expect(find('NotificationsController', 'saveSetting').permissions).toEqual(['config.manage']);
  });
});

describe('releases', () => {
  it('keeps the app’s own code behind the platform’s permissions', () => {
    // One app in the stores for every workspace: a shop's admin decides how
    // their shop works, not what code the phone in their hand is running.
    expect(find('ReleasesController', 'list').permissions).toEqual(['platform.release.view']);
    expect(find('ReleasesController', 'create').permissions).toEqual(['platform.release.manage']);
    expect(find('ReleasesController', 'upload').permissions).toEqual(['platform.release.manage']);
    expect(find('ReleasesController', 'update').permissions).toEqual(['platform.release.manage']);
    expect(find('ReleasesController', 'setGate').permissions).toEqual(['platform.release.manage']);
  });

  it('grants those to nobody in a tenant’s roles', () => {
    for (const role of DEFAULT_ROLES) {
      expect(role.permissions).not.toContain('platform.release.manage');
      expect(role.permissions).not.toContain('platform.release.view');
    }
  });
});

describe('history', () => {
  it('guards a thing’s history with the permission that guards the thing', () => {
    // Being able to read an order's history is being able to read the order —
    // it holds its rates, its client and its money.
    expect(find('HistoryController', 'order').permissions).toEqual(['order.view']);
    expect(find('HistoryController', 'lead').permissions).toEqual(['lead.view']);
    expect(find('HistoryController', 'quote').permissions).toEqual(['estimate.view']);
    expect(find('HistoryController', 'client').permissions).toEqual(['client.view']);
    expect(find('HistoryController', 'payments').permissions).toEqual(['payment.view']);
  });
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

  it('guards taking a receipt back more tightly than taking one', () => {
    // Not even the default Manager role carries this one.
    // The key still says delete; nothing is deleted any more. Taking a receipt
    // back is a new row that reverses it, and this is who may do that.
    expect(find('PaymentsController', 'reverse').permissions).toEqual(['payment.delete']);
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
    for (const handler of ['summary', 'record', 'deposit', 'reverse', 'cashPosition']) {
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
    expect(may('MANAGER', 'PaymentsController', 'reverse')).toBe(false);
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
      // Tax rates are their own permission: a shop may let somebody add a
      // material without letting them decide what GST is charged on it.
      expect(route.permissions).toEqual([
        route.handler.includes('GstSlab') ? 'gst.manage' : 'config.manage',
      ]);
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
    expect(find('WorkflowsController', 'update').permissions).toEqual(['workflow.manage']);
  });

  it('guards which stages the home screen counts', () => {
    expect(find('WorkflowsController', 'setHomeCard').permissions).toEqual([
      'workflow.manage',
    ]);
  });

  it('guards editing the status flow the API enforces', () => {
    const writes = routes.filter(
      (route) => route.controller === 'WorkflowsController' && route.method !== 'GET',
    );
    expect(writes.length).toBeGreaterThan(2);
    for (const route of writes) {
      expect(route.permissions).toEqual(['workflow.manage']);
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
  /**
   * Writes that deliberately carry no permission.
   *
   * Reporting what a client saw is not an action on the shop's data: it writes
   * to our own operational log, every signed-in person's device does it, and
   * gating it would mean a crash going unreported by whoever hit it. Listed
   * here rather than left out quietly, so the rule below stays sharp.
   */
  const OPEN_WRITES = new Set([
    'LogsController.record',
    // Marking your own notification read is not an action on the shop's data;
    // there is no way to reach anybody else's.
    'NotificationsController.read',
    'NotificationsController.readAll',
  ]);

  const mutating = routes.filter(
    (route) =>
      route.method !== 'GET' &&
      !route.isPublic &&
      !OPEN_WRITES.has(`${route.controller}.${route.handler}`),
  );

  it('leaves almost nothing ungated', () => {
    expect(OPEN_WRITES.size).toBeLessThan(5);
  });

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

describe('everything a shop can now be given', () => {
  it('gates reading a shop’s own rows too, not only writing them', () => {
    /*
     * A role with nothing ticked could still read every order in the shop,
     * because the reads had never been gated at all — nobody noticed while the
     * only roles were the seeded four, all of which could see orders. The
     * moment a shop can write its own roles, that is a screen telling somebody
     * they may not see something they can.
     *
     * The exceptions are listed rather than filtered out quietly: each one is
     * a deliberate decision about what a signed-in person may always do.
     */
    const ALWAYS_READABLE: Record<string, string> = {
      'AuthController.me': 'who you are signed in as',
      'EstimatesController.theme': 'the accent both clients paint themselves with',
      'FilesController.download': 'guarded by the unguessable id of the file',
      'NotificationsController.mine': 'your own notifications',
      'NotificationsController.unread': 'your own unread count',
      'NotificationsController.read': 'marking your own as read',
      'NotificationsController.readAll': 'marking your own as read',
      'HealthController.health': 'public, so a load balancer can ask',
      'ConfigurationController.listMaterials': 'the punch screen needs them',
      'ConfigurationController.listSizePresets': 'the punch screen needs them',
      'ConfigurationController.listGstSlabs': 'the punch screen needs them',
      'ConfigurationController.getSettings': 'how the shop measures and prices',
    };

    const ungated = routes.filter(
      (route) =>
        route.method === 'GET' &&
        !route.isPublic &&
        route.permissions.length === 0 &&
        route.roles.length === 0 &&
        !(`${route.controller}.${route.handler}` in ALWAYS_READABLE),
    );
    expect(ungated.map((route) => `${route.controller}.${route.handler}`)).toEqual([]);
  });

  it('gates every write on a permission, not on a coarse role', () => {
    /*
     * The roles screen is only real if the permissions on it govern the whole
     * product. A route left on the old `@Roles(UserRole…)` gate would ignore
     * whatever a shop ticked, which is worse than having no editor at all:
     * the screen would say somebody may not do a thing they can still do.
     */
    const stragglers = routes.filter(
      (route) =>
        route.method !== 'GET' &&
        !route.isPublic &&
        route.roles.length > 0 &&
        route.permissions.length === 0,
    );
    expect(stragglers.map((route) => `${route.controller}.${route.handler}`)).toEqual([]);
  });

  it('puts the people modules behind the module they were sold as', () => {
    for (const controller of [
      'EmployeesController',
      'AttendanceController',
      'PayrollController',
      'LettersController',
    ]) {
      const own = routes.filter((route) => route.controller === controller);
      expect(own.length).toBeGreaterThan(0);
      for (const route of own) expect(route.module).toBe('hr');
    }
  });

  it('leaves roles outside every module, because every workspace has them', () => {
    // A workspace that could not manage roles is one nobody could take a
    // permission away in.
    for (const route of routes.filter((r) => r.controller === 'RolesController')) {
      expect(route.module).toBeUndefined();
    }
  });

  it('keeps drafting a month apart from paying it', () => {
    expect(find('PayrollController', 'open').permissions).toEqual(['salary.manage']);
    expect(find('PayrollController', 'pay').permissions).toEqual(['salary.pay']);
  });

  it('keeps reading somebody’s Aadhaar apart from reading their record', () => {
    expect(find('EmployeesController', 'get').permissions).toEqual(['employee.view']);
    expect(find('EmployeesController', 'identifiers').permissions).toEqual([
      'employee.identifiers',
    ]);
  });
});

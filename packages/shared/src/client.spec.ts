import { ApiClient, ApiError } from './client';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[] = [];
let reply: { status: number; body: string } = { status: 200, body: '{"ok":true}' };

function mockFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init: Record<string, unknown> = {}) => {
      calls.push({
        url: String(url),
        method: (init.method as string) ?? 'GET',
        headers: (init.headers as Record<string, string>) ?? {},
        body: init.body,
      });
      return {
        status: reply.status,
        ok: reply.status >= 200 && reply.status < 300,
        text: async () => reply.body,
      };
    },
  );
}

function build(onUnauthorized?: () => void) {
  mockFetch();
  reply = { status: 200, body: '{"ok":true}' };
  return new ApiClient({ baseUrl: 'https://api.test/', onUnauthorized });
}

const last = () => calls[calls.length - 1];
const path = () => new URL(last().url).pathname;
const query = () => Object.fromEntries(new URL(last().url).searchParams);
const sentBody = () => JSON.parse(last().body as string);

describe('transport', () => {
  it('trims the trailing slash off the base URL', () => {
    expect(build().baseUrl).toBe('https://api.test');
  });

  it('sends no Authorization header before sign-in', async () => {
    const api = build();
    await api.me();
    expect(last().headers.Authorization).toBeUndefined();
  });

  it('sends the bearer token once it has one', async () => {
    const api = build();
    api.setToken('tok');
    await api.me();
    expect(last().headers.Authorization).toBe('Bearer tok');
    expect(api.getToken()).toBe('tok');
  });

  it('drops the token when signed out', async () => {
    const api = build();
    api.setToken('tok');
    api.setToken(null);
    await api.me();
    expect(last().headers.Authorization).toBeUndefined();
  });

  it('leaves undefined, null and empty query values off the URL entirely', async () => {
    const api = build();
    await api.orders({ search: undefined, statusId: '', clientId: 'c1' });
    // An empty `search=` would filter on the empty string rather than not filter.
    expect(query()).toEqual({ clientId: 'c1' });
  });

  it('keeps a false and a zero, which are real values', async () => {
    const api = build();
    await api.gstSlabs(false);
    expect(query()).toEqual({ includeInactive: 'false' });
  });

  it('sends no body on a GET', async () => {
    const api = build();
    await api.me();
    expect(last().body).toBeUndefined();
  });

  it('sends a JSON body with the right content type on a POST', async () => {
    const api = build();
    await api.createClient({ name: 'Verma' });
    expect(last().headers['Content-Type']).toBe('application/json');
    expect(sentBody()).toEqual({ name: 'Verma' });
  });

  it('lets the browser set the boundary on an upload', async () => {
    const api = build();
    api.setToken('tok');
    await api.addAttachments('o1', [], { kind: 'DOCUMENT' as never });
    expect(last().headers['Content-Type']).toBeUndefined();
    expect(last().headers.Authorization).toBe('Bearer tok');
  });

  it('builds an absolute file URL for an <img src>', () => {
    expect(build().fileUrl('f1')).toBe('https://api.test/files/f1');
  });

  it('builds the estimate document URL off the same base', () => {
    expect(build().estimateDocumentUrl('e1')).toBe('https://api.test/estimates/e1/document');
  });
});

describe('errors', () => {
  it('raises the server’s message rather than a status code', async () => {
    const api = build();
    reply = { status: 400, body: '{"message":"An order needs at least one item"}' };
    await expect(api.punchOrder({} as never)).rejects.toThrow(
      'An order needs at least one item',
    );
  });

  it('joins a validation array into one readable line', async () => {
    const api = build();
    reply = { status: 400, body: '{"message":["name is required","phone is invalid"]}' };
    await expect(api.createClient({ name: '' })).rejects.toThrow(
      'name is required, phone is invalid',
    );
  });

  it('falls back to the status when the body says nothing useful', async () => {
    const api = build();
    reply = { status: 502, body: '<html>Bad gateway</html>' };
    await expect(api.me()).rejects.toThrow('Request failed (502)');
  });

  it('carries the status and the parsed body on the error', async () => {
    const api = build();
    reply = { status: 409, body: '{"message":"taken","field":"slug"}' };
    const error = await api.me().catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).body).toMatchObject({ field: 'slug' });
  });

  it('returns null rather than throwing on an empty 200', async () => {
    const api = build();
    reply = { status: 200, body: '' };
    await expect(api.deleteEstimate('e1')).resolves.toBeNull();
  });

  it('calls back on a 401 so the app can sign the user out', async () => {
    const onUnauthorized = jest.fn();
    const api = build(onUnauthorized);
    reply = { status: 401, body: '{"message":"Unauthorized"}' };
    await expect(api.me()).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('does not call back on any other failure', async () => {
    const onUnauthorized = jest.fn();
    const api = build(onUnauthorized);
    reply = { status: 403, body: '{"message":"Forbidden"}' };
    await expect(api.me()).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('fetchText', () => {
  it('returns the document as it came', async () => {
    const api = build();
    reply = { status: 200, body: '<html>estimate</html>' };
    await expect(api.fetchText('/estimates/e1/document')).resolves.toBe(
      '<html>estimate</html>',
    );
  });

  it('does not hand back an error page as if it were the document', async () => {
    const api = build();
    reply = { status: 500, body: '{"message":"Renderer failed"}' };
    await expect(api.fetchText('/estimates/e1/document')).rejects.toThrow('Renderer failed');
  });

  it('signs the user out on a 401 here too', async () => {
    const onUnauthorized = jest.fn();
    const api = build(onUnauthorized);
    reply = { status: 401, body: '' };
    await expect(api.fetchText('/x')).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalled();
  });
});

describe('auth', () => {
  it('keeps the token from a successful sign-in', async () => {
    const api = build();
    reply = { status: 200, body: '{"accessToken":"tok"}' };
    await api.login('decorbucket', 'ADMIN', 'admin123');
    // The workspace comes first: an employee code means nothing until you know
    // which business it belongs to.
    expect(sentBody()).toEqual({
      workspace: 'decorbucket',
      identifier: 'ADMIN',
      password: 'admin123',
    });
    expect(api.getToken()).toBe('tok');
  });

  it('keeps the token from a platform sign-in', async () => {
    const api = build();
    reply = { status: 200, body: '{"accessToken":"ptok"}' };
    await api.platformLogin('ops@example.com', 'pw');
    expect(path()).toBe('/auth/platform/login');
    expect(api.getToken()).toBe('ptok');
  });

  it('leaves the token alone when sign-in fails', async () => {
    const api = build();
    reply = { status: 401, body: '{"message":"Wrong code or password"}' };
    await expect(api.login('w', 'x', 'y')).rejects.toThrow();
    expect(api.getToken()).toBeNull();
  });
});

/**
 * Every endpoint the apps call, checked for verb and path.
 *
 * A wrong path here is a screen that silently does nothing, and there are too
 * many of them to leave to the two that happen to get exercised by hand.
 */
describe('endpoints', () => {
  const cases: [string, (api: ApiClient) => Promise<unknown>, string, string][] = [
    ['me', (a) => a.me(), 'GET', '/auth/me'],
    ['workspaceExists', (a) => a.workspaceExists('w'), 'POST', '/auth/workspace'],

    ['clients', (a) => a.clients(), 'GET', '/clients'],
    ['searchClients', (a) => a.searchClients('verma'), 'GET', '/clients/search'],
    ['client', (a) => a.client('c1'), 'GET', '/clients/c1'],
    ['createClient', (a) => a.createClient({ name: 'V' }), 'POST', '/clients'],
    ['updateClient', (a) => a.updateClient('c1', {}), 'PATCH', '/clients/c1'],
    [
      'addClientLocation',
      (a) => a.addClientLocation('c1', { name: 'Site A' }),
      'POST',
      '/clients/c1/locations',
    ],

    ['materials', (a) => a.materials(), 'GET', '/config/materials'],
    ['createMaterial', (a) => a.createMaterial({ code: 'M', name: 'M' } as never), 'POST', '/config/materials'],
    ['updateMaterial', (a) => a.updateMaterial('m1', {}), 'PATCH', '/config/materials/m1'],
    [
      'addThickness',
      (a) => a.addThickness('m1', { value: { value: 18, unit: 'MM' } } as never),
      'POST',
      '/config/materials/m1/thicknesses',
    ],
    ['removeThickness', (a) => a.removeThickness('t1'), 'DELETE', '/config/thicknesses/t1'],
    ['sizePresets', (a) => a.sizePresets(), 'GET', '/config/size-presets'],
    ['createSizePreset', (a) => a.createSizePreset({} as never), 'POST', '/config/size-presets'],
    ['updateSizePreset', (a) => a.updateSizePreset('sp1', {}), 'PATCH', '/config/size-presets/sp1'],
    ['setSetting', (a) => a.setSetting('accent', '#000'), 'PATCH', '/config/settings/accent'],

    ['workflows', (a) => a.workflows(), 'GET', '/workflows'],
    ['defaultWorkflow', (a) => a.defaultWorkflow(), 'GET', '/workflows/default'],
    ['workflow', (a) => a.workflow('w1'), 'GET', '/workflows/w1'],
    ['createWorkflow', (a) => a.createWorkflow({ name: 'W' } as never), 'POST', '/workflows'],
    ['addStatus', (a) => a.addStatus('w1', {} as never), 'POST', '/workflows/w1/statuses'],
    ['updateStatus', (a) => a.updateStatus('s1', {}), 'PATCH', '/workflows/statuses/s1'],
    ['removeStatus', (a) => a.removeStatus('s1'), 'DELETE', '/workflows/statuses/s1'],
    [
      'saveWorkflowGraph',
      (a) => a.saveWorkflowGraph('w1', { positions: [], transitions: [] }),
      'POST',
      '/workflows/w1/graph',
    ],
    ['allowedNext', (a) => a.allowedNext('s1'), 'GET', '/workflows/statuses/s1/next'],

    ['orders', (a) => a.orders(), 'GET', '/orders'],
    ['orderBoard', (a) => a.orderBoard(), 'GET', '/orders/board'],
    ['order', (a) => a.order('o1'), 'GET', '/orders/o1'],
    ['punchOrder', (a) => a.punchOrder({} as never), 'POST', '/orders'],
    ['updateOrder', (a) => a.updateOrder('o1', {}), 'PATCH', '/orders/o1'],
    ['changeOrderStatus', (a) => a.changeOrderStatus('o1', { toStatusId: 's2' }), 'POST', '/orders/o1/status'],
    ['repriceOrder', (a) => a.repriceOrder('o1', {}), 'PATCH', '/orders/o1/terms'],
    ['removeAttachment', (a) => a.removeAttachment('a1'), 'DELETE', '/orders/attachments/a1'],

    ['gstSlabs', (a) => a.gstSlabs(), 'GET', '/config/gst-slabs'],
    ['createGstSlab', (a) => a.createGstSlab({ name: '18%', ratePct: 18 }), 'POST', '/config/gst-slabs'],
    ['updateGstSlab', (a) => a.updateGstSlab('g1', {}), 'PATCH', '/config/gst-slabs/g1'],

    ['sendLogs', (a) => a.sendLogs({ client: 'app', entries: [] }), 'POST', '/logs'],
    ['paymentSummary', (a) => a.paymentSummary('o1'), 'GET', '/orders/o1/payments'],
    ['recordPayment', (a) => a.recordPayment('o1', { amount: 1 } as never), 'POST', '/orders/o1/payments'],
    ['reversePayment', (a) => a.reversePayment('p1', 'why'), 'POST', '/payments/p1/reverse'],
    ['recordDeposit', (a) => a.recordDeposit({ amount: 1 } as never), 'POST', '/payments/deposits'],
    ['cashPosition', (a) => a.cashPosition(), 'GET', '/payments/cash-position'],
    ['cashInHand', (a) => a.cashInHand(), 'GET', '/payments/cash-in-hand'],

    ['users', (a) => a.users(), 'GET', '/users'],
    ['roles', (a) => a.roles(), 'GET', '/roles'],
    ['createRole', (a) => a.createRole({ name: 'A', permissions: [] }), 'POST', '/roles'],
    ['updateRole', (a) => a.updateRole('r1', { name: 'A', permissions: [] }), 'PATCH', '/roles/r1'],
    ['deleteRole', (a) => a.deleteRole('r1'), 'DELETE', '/roles/r1'],
    ['assignRole', (a) => a.assignRole('u1', 'r1'), 'PATCH', '/roles/users/u1'],
    ['employees', (a) => a.employees(), 'GET', '/employees'],
    ['employee', (a) => a.employee('e1'), 'GET', '/employees/e1'],
    [
      'employeeIdentifiers',
      (a) => a.employeeIdentifiers('e1'),
      'GET',
      '/employees/e1/identifiers',
    ],
    ['createEmployee', (a) => a.createEmployee({ name: 'R' } as never), 'POST', '/employees'],
    [
      'updateEmployee',
      (a) => a.updateEmployee('e1', { name: 'R' } as never),
      'PATCH',
      '/employees/e1',
    ],
    [
      'markEmployeeLeft',
      (a) => a.markEmployeeLeft('e1', '2026-09-30'),
      'POST',
      '/employees/e1/left',
    ],

    ['attendanceDay', (a) => a.attendanceDay('2026-09-09'), 'GET', '/attendance/day'],
    ['markAttendance', (a) => a.markAttendance('2026-09-09', []), 'POST', '/attendance/day'],
    [
      'attendanceSummary',
      (a) => a.attendanceSummary({ from: '2026-09-01', to: '2026-09-30' }),
      'GET',
      '/attendance/summary',
    ],

    ['payStructures', (a) => a.payStructures(), 'GET', '/payroll/structures'],
    [
      'setPayStructure',
      (a) => a.setPayStructure({ employeeId: 'e1', kind: 'MONTHLY', rate: 1, effectiveFrom: '2026-10-01' }),
      'POST',
      '/payroll/structures',
    ],
    ['salaryAdvances', (a) => a.salaryAdvances(), 'GET', '/payroll/advances'],
    [
      'giveSalaryAdvance',
      (a) => a.giveSalaryAdvance({ employeeId: 'e1', amount: 1, givenOn: '2026-09-05', mode: 'CASH' }),
      'POST',
      '/payroll/advances',
    ],
    ['salaryRuns', (a) => a.salaryRuns(), 'GET', '/payroll/runs'],
    ['salaryRun', (a) => a.salaryRun('r1'), 'GET', '/payroll/runs/r1'],
    [
      'openSalaryRun',
      (a) => a.openSalaryRun({ month: '2026-09', workingDays: 26 }),
      'POST',
      '/payroll/runs',
    ],
    [
      'adjustPayslip',
      (a) => a.adjustPayslip('r1', 'p1', { pieces: 10 }),
      'PATCH',
      '/payroll/runs/r1/payslips/p1',
    ],
    ['approveSalaryRun', (a) => a.approveSalaryRun('r1'), 'POST', '/payroll/runs/r1/approve'],
    ['paySalaryRun', (a) => a.paySalaryRun('r1', 'ONLINE'), 'POST', '/payroll/runs/r1/pay'],
    ['discardSalaryRun', (a) => a.discardSalaryRun('r1'), 'DELETE', '/payroll/runs/r1'],

    ['expenses', (a) => a.expenses(), 'GET', '/expenses'],
    ['expense', (a) => a.expense('e1'), 'GET', '/expenses/e1'],
    ['createExpense', (a) => a.createExpense({ amount: 1 } as never), 'POST', '/expenses'],
    ['updateExpense', (a) => a.updateExpense('e1', { amount: 1 } as never), 'PATCH', '/expenses/e1'],
    ['reverseExpense', (a) => a.reverseExpense('e1', 'why'), 'POST', '/expenses/e1/reverse'],
    ['expenseEdits', (a) => a.expenseEdits('e1'), 'GET', '/expenses/e1/edits'],
    ['expenseAnalytics', (a) => a.expenseAnalytics(), 'GET', '/expenses/analytics'],
    [
      'reverseDisbursement',
      (a) => a.reverseDisbursement('d1', 'why'),
      'POST',
      '/disbursements/d1/reverse',
    ],
    ['removeExpenseBill', (a) => a.removeExpenseBill('e1'), 'DELETE', '/expenses/e1/bill'],
    ['expenseOptions', (a) => a.expenseOptions(), 'GET', '/expenses/options'],
    ['allExpenseOptions', (a) => a.allExpenseOptions(), 'GET', '/expenses/options/all'],
    [
      'createExpenseOption',
      (a) => a.createExpenseOption({ field: 'VENDOR', label: 'Shop' }),
      'POST',
      '/expenses/options',
    ],
    ['updateExpenseOption', (a) => a.updateExpenseOption('o1', {}), 'PATCH', '/expenses/options/o1'],
    ['deleteExpenseOption', (a) => a.deleteExpenseOption('o1'), 'DELETE', '/expenses/options/o1'],
    [
      'reorderExpenseOptions',
      (a) => a.reorderExpenseOptions('VENDOR', ['o1']),
      'PATCH',
      '/expenses/options/order',
    ],

    ['disbursementLabel', (a) => a.disbursementLabel(), 'GET', '/disbursements/label'],
    ['setDisbursementLabel', (a) => a.setDisbursementLabel('ISC'), 'PATCH', '/disbursements/label'],
    ['disbursementCategories', (a) => a.disbursementCategories(), 'GET', '/disbursements/categories'],
    [
      'createDisbursementCategory',
      (a) => a.createDisbursementCategory({ code: 'C', name: 'C' } as never),
      'POST',
      '/disbursements/categories',
    ],
    [
      'deactivateDisbursementCategory',
      (a) => a.deactivateDisbursementCategory('c1'),
      'DELETE',
      '/disbursements/categories/c1',
    ],
    ['disbursementLedger', (a) => a.disbursementLedger(), 'GET', '/disbursements'],
    ['orderDisbursements', (a) => a.orderDisbursements('o1'), 'GET', '/disbursements/order/o1'],
    ['createDisbursement', (a) => a.createDisbursement('o1', {} as never), 'POST', '/disbursements/order/o1'],
    ['settleDisbursement', (a) => a.settleDisbursement('d1', {} as never), 'POST', '/disbursements/d1/settle'],
    ['updateDisbursement', (a) => a.updateDisbursement('d1', {}), 'PATCH', '/disbursements/d1'],
    ['cancelDisbursement', (a) => a.cancelDisbursement('d1'), 'DELETE', '/disbursements/d1'],

    ['firmProfile', (a) => a.firmProfile(), 'GET', '/firm'],
    ['firmTheme', (a) => a.firmTheme(), 'GET', '/firm/theme'],
    ['saveFirmProfile', (a) => a.saveFirmProfile({} as never), 'PATCH', '/firm'],
    ['clearLetterhead', (a) => a.clearLetterhead('logo'), 'DELETE', '/firm/letterhead'],

    ['estimates', (a) => a.estimates(), 'GET', '/estimates'],
    ['estimate', (a) => a.estimate('e1'), 'GET', '/estimates/e1'],
    ['createEstimate', (a) => a.createEstimate({} as never), 'POST', '/estimates'],
    ['updateEstimate', (a) => a.updateEstimate('e1', {} as never), 'PATCH', '/estimates/e1'],
    ['setEstimateStatus', (a) => a.setEstimateStatus('e1', 'SENT' as never), 'POST', '/estimates/e1/status'],
    [
      'convertEstimate',
      (a) => a.convertEstimate('e1', { location: 'Site A' }),
      'POST',
      '/estimates/e1/convert',
    ],
    ['deleteEstimate', (a) => a.deleteEstimate('e1'), 'DELETE', '/estimates/e1'],

    ['leads', (a) => a.leads(), 'GET', '/leads'],
    ['leadBoard', (a) => a.leadBoard(), 'GET', '/leads/board'],
    ['lead', (a) => a.lead('l1'), 'GET', '/leads/l1'],
    ['createLead', (a) => a.createLead({} as never), 'POST', '/leads'],
    ['updateLead', (a) => a.updateLead('l1', {} as never), 'PATCH', '/leads/l1'],
    ['changeLeadStatus', (a) => a.changeLeadStatus('l1', { toStatusId: 's2' }), 'POST', '/leads/l1/status'],
    ['convertLead', (a) => a.convertLead('l1', {} as never), 'POST', '/leads/l1/convert'],
    ['leadSources', (a) => a.leadSources(), 'GET', '/leads/sources'],
    ['createLeadSource', (a) => a.createLeadSource({} as never), 'POST', '/leads/sources'],
    ['leadFields', (a) => a.leadFields(), 'GET', '/leads/fields'],
    ['createLeadField', (a) => a.createLeadField({} as never), 'POST', '/leads/fields'],
    ['updateLeadField', (a) => a.updateLeadField('f1', {}), 'PATCH', '/leads/fields/f1'],
    ['deactivateLeadField', (a) => a.deactivateLeadField('f1'), 'DELETE', '/leads/fields/f1'],

    ['tenants', (a) => a.tenants(), 'GET', '/platform/tenants'],

    ['notifications', (a) => a.notifications(), 'GET', '/notifications'],
    ['unreadNotifications', (a) => a.unreadNotifications(), 'GET', '/notifications/unread'],
    ['readNotification', (a) => a.readNotification('n1'), 'POST', '/notifications/n1/read'],
    ['readAllNotifications', (a) => a.readAllNotifications(), 'POST', '/notifications/read-all'],
    ['notificationSettings', (a) => a.notificationSettings(), 'GET', '/notifications/settings/all'],
    [
      'saveNotificationSetting',
      (a) => a.saveNotificationSetting('order.moved', { enabled: false }),
      'PUT',
      '/notifications/settings/order.moved',
    ],

    [
      'openWorkspace',
      (a) => a.openWorkspace('t1', 'Their board is not loading'),
      'POST',
      '/platform/tenants/t1/open',
    ],
    ['releases', (a) => a.releases(), 'GET', '/platform/releases'],
    ['release', (a) => a.release('r1'), 'GET', '/platform/releases/r1'],
    [
      'createRelease',
      (a) => a.createRelease({ channel: 'production', platform: 'ios', runtimeVersion: '1.0.0' }),
      'POST',
      '/platform/releases',
    ],
    ['updateRelease', (a) => a.updateRelease('r1', { rolloutPercent: 10 }), 'PATCH', '/platform/releases/r1'],
    ['versionGates', (a) => a.versionGates(), 'GET', '/platform/releases/gates/all'],
    [
      'setVersionGate',
      (a) => a.setVersionGate({ platform: 'ios', channel: 'production', minimumVersion: '1.0.0' }),
      'PUT',
      '/platform/releases/gates',
    ],
    ['tenant', (a) => a.tenant('t1'), 'GET', '/platform/tenants/t1'],
    ['createTenant', (a) => a.createTenant({} as never), 'POST', '/platform/tenants'],
    ['updateTenant', (a) => a.updateTenant('t1', {}), 'PATCH', '/platform/tenants/t1'],
  ];

  it.each(cases)('%s calls %s %s', async (_name, call, method, expected) => {
    const api = build();
    await call(api);
    expect(last().method).toBe(method);
    expect(path()).toBe(expected);
  });
});

describe('endpoint details worth pinning', () => {
  it('sends the search term as q, which is what the controller reads', async () => {
    const api = build();
    await api.searchClients('verma');
    expect(query()).toEqual({ q: 'verma' });
  });

  it('names the entity when creating a lead custom field', async () => {
    const api = build();
    await api.createLeadField({ key: 'architect', label: 'Architect' } as never);
    expect(sentBody().entity).toBe('LEAD');
  });

  it('lets the caller override the entity it defaults', async () => {
    const api = build();
    await api.createLeadField({ entity: 'ORDER', key: 'k', label: 'L' } as never);
    expect(sentBody().entity).toBe('ORDER');
  });

  it('wraps a bare setting value in the shape the controller expects', async () => {
    const api = build();
    await api.setSetting('accent', '#2563EB');
    expect(sentBody()).toEqual({ value: '#2563EB' });
  });

  it('wraps the disbursement label the same way', async () => {
    const api = build();
    await api.setDisbursementLabel('Site charges');
    expect(sentBody()).toEqual({ label: 'Site charges' });
  });

  it('wraps an estimate status change', async () => {
    const api = build();
    await api.setEstimateStatus('e1', 'ACCEPTED' as never);
    expect(sentBody()).toEqual({ status: 'ACCEPTED' });
  });

  it('says which image it is clearing', async () => {
    const api = build();
    await api.clearLetterhead('logo');
    expect(query()).toEqual({ kind: 'logo' });
  });

  it('asks for an order in the unit the screen is showing', async () => {
    const api = build();
    await api.order('o1', 'FT');
    expect(query()).toEqual({ unit: 'FT' });
  });

  it('asks for the default board when no workflow is named', async () => {
    const api = build();
    await api.orderBoard();
    expect(query()).toEqual({});
  });
});

describe('saveFirmProfile', () => {
  it('drops the columns the server manages, which it would otherwise refuse', async () => {
    const api = build();
    await api.saveFirmProfile({
      id: 'f1',
      name: 'Decor Bucket',
      updatedAt: '2026-09-07T00:00:00Z',
      letterheadFileId: 'file-1',
      logoFileId: 'file-2',
      accentColor: '#FF6B1A',
      themeAccent: '#E4232F',
    } as never);
    // Both apps hand the loaded row straight back; the API answers
    // "property id should not exist" for every one of these.
    expect(sentBody()).toEqual({
      name: 'Decor Bucket',
      accentColor: '#FF6B1A',
      themeAccent: '#E4232F',
    });
  });

  it('sends every field the firm profile actually accepts', async () => {
    const api = build();
    const everything = {
      name: 'Decor Bucket',
      gstin: '08AAWFD7264P1ZC',
      stateCode: '08',
      stateName: 'Rajasthan',
      phone: '8764029735',
      email: 'a@b.com',
      address: 'H-1053',
      website: 'decorbucket.in',
      bankName: 'HDFC',
      bankAccountName: 'Decor bucket',
      bankAccountNumber: '50200099660350',
      bankIfsc: 'HDFC0007372',
      bankBranch: 'Mahesh nagar',
      termsAndConditions: 'Terms',
      signatoryName: 'Nakul',
      accentColor: '#FF6B1A',
      themeAccent: '#E4232F',
    };
    await api.saveFirmProfile(everything as never);
    expect(sentBody()).toEqual(everything);
  });

  it('omits a cleared field rather than sending null, which fails validation', async () => {
    const api = build();
    await api.saveFirmProfile({ name: 'Decor Bucket', gstin: null } as never);
    expect(sentBody()).toEqual({ name: 'Decor Bucket' });
  });

  it('keeps an empty string, which is how a field is actually cleared', async () => {
    const api = build();
    await api.saveFirmProfile({ name: 'Decor Bucket', gstin: '' } as never);
    expect(sentBody()).toEqual({ name: 'Decor Bucket', gstin: '' });
  });
});

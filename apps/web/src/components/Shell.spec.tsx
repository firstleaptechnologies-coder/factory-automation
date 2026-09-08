import { render, screen, fireEvent } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import { Shell } from './Shell';

const replace = jest.fn();
let pathname = '/';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => pathname,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const signOut = jest.fn();
let auth: Record<string, unknown>;
jest.mock('@/lib/auth', () => ({ useAuth: () => auth }));

function mount(over: Record<string, unknown> = {}) {
  auth = {
    user: { name: 'Nakul', code: 'NAKUL', permissions: [] as string[] },
    loading: false,
    signOut,
    can: (permission: string) =>
      ((auth.user as { permissions: string[] } | null)?.permissions ?? []).includes(permission),
    ...over,
  };
  return render(<Shell>page</Shell>);
}

const withPermissions = (...permissions: string[]) => ({
  user: { name: 'Nakul', code: 'NAKUL', permissions },
});

beforeEach(() => {
  jest.clearAllMocks();
  pathname = '/';
  window.localStorage.clear();
});

it('shows a loader while the session is still being restored', () => {
  mount({ loading: true, user: null });
  expect(screen.getByText('Loading')).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

it('sends a signed-out visitor to the login screen', () => {
  mount({ loading: false, user: null });
  expect(replace).toHaveBeenCalledWith('/login');
});

it('sends a platform admin to the platform screens', () => {
  mount({ user: { name: 'Ops', isPlatform: true, permissions: [] } });
  // A platform admin belongs to no workspace, so the shop's screens are empty.
  expect(replace).toHaveBeenCalledWith('/platform/tenants');
});

it('leaves a platform admin already on a platform screen alone', () => {
  pathname = '/platform/tenants';
  mount({ user: { name: 'Ops', isPlatform: true, permissions: [] } });
  expect(replace).not.toHaveBeenCalled();
});

it('always offers Home, whatever the role', () => {
  mount();
  expect(screen.getByText('Home')).toBeInTheDocument();
});

it('hides everything the user is not allowed to see', () => {
  mount();
  // Filtered by permission, the same way the API decides.
  for (const label of ['Punch order', 'Orders', 'Board', 'Estimates', 'Leads', 'Clients']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});

it('shows a link once its permission is granted', () => {
  mount(withPermissions(PERMISSIONS.ORDER_PUNCH));
  expect(screen.getByText('Punch order')).toBeInTheDocument();
  expect(screen.queryByText('Orders')).not.toBeInTheDocument();
});

it('shows one permission’s several screens together', () => {
  mount(withPermissions(PERMISSIONS.CASH_POSITION_VIEW, PERMISSIONS.DISBURSEMENT_VIEW));
  expect(screen.getByText('Transactions')).toBeInTheDocument();
  expect(screen.getByText('Payout ledger')).toBeInTheDocument();
});

it('offers no board of its own', () => {
  mount(withPermissions(PERMISSIONS.ORDER_VIEW));
  // The board is a way of looking at the order list, reached from it — not a
  // place of its own in the sidebar.
  expect(screen.getByText('Orders')).toBeInTheDocument();
  expect(screen.queryByText('Board')).not.toBeInTheDocument();
});

it('hides a category when nothing inside it is allowed', () => {
  mount();
  expect(screen.queryByText('Finances')).not.toBeInTheDocument();
});

it('shows a category with the screens under it', () => {
  mount(withPermissions(PERMISSIONS.DISBURSEMENT_VIEW));
  expect(screen.getByText('Finances')).toBeInTheDocument();
  expect(screen.getByText('Payout ledger')).toBeInTheDocument();
  expect(screen.queryByText('Transactions')).not.toBeInTheDocument();
});

it('hides the settings from someone who cannot configure anything', () => {
  mount(withPermissions(PERMISSIONS.ORDER_VIEW));
  expect(screen.queryByText('Order settings')).not.toBeInTheDocument();
  expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
});

it('shows every settings screen to someone who can configure', () => {
  mount(withPermissions(PERMISSIONS.CONFIG_VIEW));
  expect(screen.getByText('Order settings')).toBeInTheDocument();
  for (const label of ['Firm details', 'Materials', 'Sizes', 'Status flow', 'Lead fields']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

describe('the active link', () => {
  it('lights up the section the user is in', () => {
    pathname = '/orders/o1';
    mount(withPermissions(PERMISSIONS.ORDER_VIEW));
    expect(screen.getByText('Orders').closest('a')).toHaveAttribute('data-active', 'true');
  });

  it('does not light up Home on every page', () => {
    pathname = '/orders';
    mount(withPermissions(PERMISSIONS.ORDER_VIEW));
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('data-active', 'false');
  });

  it('lights up Home on Home', () => {
    pathname = '/';
    mount();
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('data-active', 'true');
  });
});

it('shows who is signed in', () => {
  mount();
  expect(screen.getByText('Nakul')).toBeInTheDocument();
  expect(screen.getByText('NAKUL')).toBeInTheDocument();
});

it('falls back to the role when there is no employee code', () => {
  mount({ user: { name: 'Ops', role: 'ADMIN', permissions: [] } });
  expect(screen.getByText('ADMIN')).toBeInTheDocument();
});

it('signs the user out', () => {
  mount();
  fireEvent.click(screen.getByText('Sign out'));
  expect(signOut).toHaveBeenCalled();
});

it('renders the page inside the frame', () => {
  mount();
  expect(screen.getByText('page')).toBeInTheDocument();
});

describe('the categories', () => {
  const all = () => withPermissions(...Object.values(PERMISSIONS));

  it('groups the screens by what they are for', () => {
    mount(all());
    for (const heading of ['Order management', 'Finances', 'Vendor management', 'Workspace']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
  });

  it('keeps a module’s own settings inside that module', () => {
    mount(all());
    const orders = screen.getByTestId('nav-group-orders').closest('.nav-section')!;
    expect(orders.querySelector('[data-testid="nav-group-order-settings"]')).not.toBeNull();
  });

  it('leaves Home outside the categories, since it is where you land', () => {
    mount(all());
    const home = screen.getByText('Home').closest('a')!;
    expect(home.closest('.nav-section')).toBeNull();
  });

  it('draws a rule down the left of each category', () => {
    mount(all());
    // Without it the headings were the only thing saying where one category
    // ended and the next began.
    expect(document.querySelectorAll('.nav-section').length).toBeGreaterThan(3);
  });

  it('steps a module’s settings in from its own rule', () => {
    mount(all());
    const settings = screen.getByTestId('nav-group-order-settings').closest('.nav-section')!;
    expect(settings).toHaveAttribute('data-depth', '1');
  });

  it('lights up the rule of the category you are in', () => {
    pathname = '/disbursements';
    mount(all());
    const finances = screen.getByTestId('nav-group-finances').closest('.nav-section')!;
    // A glance at the rule answers "where am I" without reading a label.
    expect(finances).toHaveAttribute('data-current', 'true');
    const vendors = screen.getByTestId('nav-group-vendors').closest('.nav-section')!;
    expect(vendors).toHaveAttribute('data-current', 'false');
  });

  it('folds a category away, and says so', () => {
    mount(all());
    expect(screen.getByText('Payout ledger')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nav-group-finances'));
    // A menu that only grows becomes a menu nobody reads.
    expect(screen.queryByText('Payout ledger')).not.toBeInTheDocument();
    expect(screen.getByTestId('nav-group-finances')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens it again', () => {
    mount(all());
    fireEvent.click(screen.getByTestId('nav-group-finances'));
    fireEvent.click(screen.getByTestId('nav-group-finances'));
    expect(screen.getByText('Payout ledger')).toBeInTheDocument();
  });

  it('remembers what was folded away', () => {
    mount(all());
    fireEvent.click(screen.getByTestId('nav-group-finances'));
    expect(JSON.parse(window.localStorage.getItem('decor.nav.closed')!)).toContain('finances');
  });

  it('opens with what was folded away last time still folded', () => {
    window.localStorage.setItem('decor.nav.closed', JSON.stringify(['finances']));
    mount(all());
    expect(screen.queryByText('Payout ledger')).not.toBeInTheDocument();
  });

  it('keeps the category holding the current page open, however it was left', () => {
    window.localStorage.setItem('decor.nav.closed', JSON.stringify(['finances']));
    pathname = '/disbursements';
    mount(all());
    // Collapsing away the page somebody is looking at is disorienting.
    expect(screen.getByText('Payout ledger')).toBeInTheDocument();
  });

  it('opens a category nobody has ever seen, rather than hiding a new module', () => {
    // What is stored is what is shut, so a group added in a later release is
    // open by default.
    window.localStorage.setItem('decor.nav.closed', JSON.stringify(['something-old']));
    mount(all());
    expect(screen.getByText('Payout ledger')).toBeInTheDocument();
  });

  it('survives a browser that refuses storage', () => {
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    mount(all());
    expect(screen.getByText('Payout ledger')).toBeInTheDocument();
    getItem.mockRestore();
  });
});

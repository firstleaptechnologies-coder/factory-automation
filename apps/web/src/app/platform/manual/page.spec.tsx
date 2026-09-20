import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PRODUCT_MANUAL, undefinedFields, workspaceModules } from '@fas/shared';
import ManualPage from './page';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'p1', isPlatform: true }, loading: false, signOut: jest.fn() }),
}));

/** Downloading is the browser's job; what matters is what was put in the file. */
let downloaded = '';
beforeAll(() => {
  Object.defineProperty(global.URL, 'createObjectURL', {
    writable: true,
    value: (blob: Blob) => {
      // jsdom's Blob has no text() worth awaiting in a sync handler, so the
      // content is captured from the parts the page passed in.
      downloaded = (blob as unknown as { __parts?: string[] }).__parts?.join('') ?? '';
      return 'blob:manual';
    },
  });
  Object.defineProperty(global.URL, 'revokeObjectURL', { writable: true, value: () => {} });

  const RealBlob = global.Blob;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Blob = function (parts: string[], options?: BlobPropertyBag) {
    const blob = new RealBlob(parts, options);
    (blob as unknown as { __parts: string[] }).__parts = parts;
    return blob;
  };
});

const mount = async () => {
  await act(async () => {
    render(<ManualPage />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  downloaded = '';
  HTMLAnchorElement.prototype.click = jest.fn();
});

describe('what the owner reads', () => {
  it('opens on a module and describes it in words, not field names', async () => {
    await mount();
    const body = within(screen.getByTestId('manual-body'));
    expect(body.getByText(/The reason to buy this/)).toBeInTheDocument();
  });

  it('shows what each thing accepts, and what those fields are for', async () => {
    await mount();
    const body = within(screen.getByTestId('manual-body'));
    expect(body.getAllByText('What it is for').length).toBeGreaterThan(0);
  });

  /*
   * A blank cell reads as "nothing to say". It means "nobody has said it".
   *
   * Which module still has blanks changes as they get written — this was
   * pinned to Orders and failed the day Orders was finished, which is a test
   * failing because the work succeeded. So it asks the data which module is
   * incomplete, and when none is, asserts the opposite.
   */
  it('marks a field nobody has written up rather than leaving it blank', async () => {
    const incomplete = workspaceModules(PRODUCT_MANUAL).find((module) =>
      module.actions.some((action) => action.fields.some((f) => !f.definition.trim())),
    );

    await mount();

    if (!incomplete) {
      expect(screen.queryByText('Not yet written up.')).not.toBeInTheDocument();
      return;
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: incomplete.label }));
    });
    const body = within(screen.getByTestId('manual-body'));
    expect(body.getAllByText('Not yet written up.').length).toBeGreaterThan(0);
  });

  /*
   * Says where it stands either way. This asserted the count of unexplained
   * fields and failed the day there were none — the page falling silent on
   * being finished is itself a thing worth not doing, so it now says so.
   */
  it('says where it stands, whether or not anything is unexplained', async () => {
    await mount();
    const unexplained = undefinedFields(PRODUCT_MANUAL).length;
    expect(
      screen.getByText(unexplained ? /still have no explanation/ : /are explained/),
    ).toBeInTheDocument();
  });

  it('can be switched to another module', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'People' }));
    });
    const body = within(screen.getByTestId('manual-body'));
    expect(body.getByText(/whether they are there today/)).toBeInTheDocument();
  });

  it('marks the console as ours and never for export', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'FirstLeap console' }));
    });
    expect(screen.getByText('ours — never exported')).toBeInTheDocument();
  });
});

describe('sending it to a vendor', () => {
  const exportButton = () => screen.getByRole('button', { name: /^Export / });

  it('starts with everything ticked, since unticking is the smaller job', async () => {
    await mount();
    expect(exportButton()).toHaveTextContent('Export 12 modules');
  });

  it('never offers the console as something to tick', async () => {
    await mount();
    // What FirstLeap does above a shop is not a shop's business.
    const picks = Array.from(document.querySelectorAll('.pick')).map((p) => p.textContent);
    expect(picks.join(' ')).not.toMatch(/FirstLeap console/);
  });

  it('leaves out what was unticked', async () => {
    await mount();
    // Two things say "Purchasing": the tick-box and the read-it chip.
    const tick = Array.from(document.querySelectorAll('.pick'))
      .find((p) => p.textContent?.startsWith('Purchasing'))!
      .querySelector('input')!;
    await act(async () => {
      fireEvent.click(tick);
    });
    await act(async () => {
      fireEvent.click(exportButton());
    });
    expect(downloaded).toMatch(/An order is punched the moment it is agreed/);
    expect(downloaded).not.toMatch(/what is on the rack and what was thrown away/);
  });

  it('names who it was prepared for', async () => {
    await mount();
    const input = document.querySelector('label.field input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Decor Bucket' } });
    });
    await act(async () => {
      fireEvent.click(exportButton());
    });
    expect(downloaded).toMatch(/Prepared for Decor Bucket/);
  });

  it('writes one file with nothing to fetch', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(exportButton());
    });
    expect(downloaded).toMatch(/<!doctype html>/i);
    expect(downloaded).not.toMatch(/<script/);
    expect(downloaded).not.toMatch(/https?:\/\//);
  });

  it('will not export nothing at all', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Untick all' }));
    });
    expect(screen.getByRole('button', { name: /^Export 0/ })).toBeDisabled();
  });
});

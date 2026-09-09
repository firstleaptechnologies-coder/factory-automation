import { fireEvent, render, screen } from '@testing-library/react-native';
import { PERMISSIONS, PERMISSION_TREE, permissionsUnder } from '@fas/shared';
import { PermissionTree } from './PermissionTree';

const everything = () => true;
const nothing = () => false;

const mount = async (granted: string[], has = everything) => {
  const onChange = jest.fn();
  await render(<PermissionTree granted={granted} has={has} onChange={onChange} />);
  return onChange;
};

const open = async (label: string) => {
  await fireEvent.press(screen.getByText(label));
};

const FINANCE = PERMISSION_TREE.find((one) => one.key === 'finance')!;

it('names every section the product has', async () => {
  await mount([]);
  for (const section of PERMISSION_TREE) {
    expect(screen.getByText(section.label)).toBeTruthy();
  }
});

it('says how much of a section is held before it is opened', async () => {
  await mount([PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD]);

  expect(screen.getByText(`2 of ${permissionsUnder(FINANCE).length}`)).toBeTruthy();
});

it('turns a whole section on from its Select all', async () => {
  const onChange = await mount([]);
  // Every section has one; the finance one is the second heading down.
  const buttons = screen.getAllByText('Select all');
  fireEvent.press(buttons[PERMISSION_TREE.indexOf(FINANCE)]);

  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(permissionsUnder(FINANCE)));
});

it('clears a section that was fully on', async () => {
  const all = permissionsUnder(FINANCE);
  const onChange = await mount([...all]);
  fireEvent.press(screen.getAllByText('Select all')[PERMISSION_TREE.indexOf(FINANCE)]);

  expect(onChange).toHaveBeenCalledWith([]);
});

// The half-ticked case is the one that matters: filling in is what somebody
// tapping a part-ticked branch means, and showing it as off would let them
// grant the rest without noticing.
it('fills a part-held section in rather than clearing it', async () => {
  const all = permissionsUnder(FINANCE);
  const onChange = await mount([all[0]]);
  fireEvent.press(screen.getAllByText('Select all')[PERMISSION_TREE.indexOf(FINANCE)]);

  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(all));
});

it('marks a part-held branch as part-held, never as off', async () => {
  await mount([permissionsUnder(FINANCE)[0]]);

  expect(screen.getAllByTestId('perm-box-some').length).toBeGreaterThan(0);
});

it('ticks one permission on without touching the others', async () => {
  const onChange = await mount([PERMISSIONS.PAYMENT_VIEW]);
  await open('Finances');
  fireEvent.press(screen.getByText('Record payments'));

  expect(onChange).toHaveBeenCalledWith([PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD]);
});

it('ticks one permission off again', async () => {
  const onChange = await mount([PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD]);
  await open('Finances');
  fireEvent.press(screen.getByText('View payments'));

  expect(onChange).toHaveBeenCalledWith([PERMISSIONS.PAYMENT_RECORD]);
});

describe('a module the workspace has not bought', () => {
  it('is shown rather than hidden', async () => {
    await mount([], nothing);

    expect(screen.getByText('Buying and stock')).toBeTruthy();
    expect(screen.getByText(/Purchasing is not on this workspace’s plan/)).toBeTruthy();
  });

  it('cannot be ticked', async () => {
    const onChange = await mount([], nothing);
    await open('Finances');
    fireEvent.press(screen.getByText('View payments'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers no Select all to tick it with either', async () => {
    await mount([], nothing);

    // The only ones left belong to the sections nobody buys separately —
    // roles, sizes, the firm's own details — which every workspace has.
    const free = PERMISSION_TREE.filter((one) => one.module === null).length;
    expect(screen.getAllByText('Select all')).toHaveLength(free);
  });

  // Roles, sizes, the firm's own details: a workspace has these whatever it
  // pays, so the section that grants them is never greyed.
  it('leaves the parts of the product nobody buys separately alone', async () => {
    await mount([], nothing);
    const workspace = PERMISSION_TREE.find((one) => one.module === null)!;
    await open(workspace.label);

    expect(screen.getByText(workspace.features[0].label)).toBeTruthy();
  });
});

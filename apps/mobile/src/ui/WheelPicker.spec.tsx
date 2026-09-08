import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { WheelPicker } from './WheelPicker';

const ITEM_HEIGHT = 46;

afterEach(cleanup);

const OPTIONS = [
  { id: null, label: 'Any material' },
  { id: 'm1', label: 'MDF', color: '#B98B54' },
  { id: 'm2', label: 'Plywood' },
  { id: 'm3', label: 'Acrylic' },
];

async function mount(value: string | null = null) {
  const onChange = jest.fn();
  const view = await render(
    <WheelPicker options={OPTIONS} value={value} onChange={onChange} label="Material" />,
  );
  return { onChange, view, scroll: screen.getByTestId('wheel-scroll') };
}

/**
 * The drag-end handler is called directly rather than through `fireEvent`:
 * ScrollView's own `onScrollEndDrag` wrapper leaves internal state behind in
 * the test renderer that breaks the next render in the file.
 */
async function endDrag(scroll: { props: Record<string, never> }, event: unknown) {
  await act(async () => {
    (scroll.props.onScrollEndDrag as never as (e: unknown) => void)(event);
  });
}

/**
 * Momentum ends, called directly for the same reason the drag handler is:
 * driving the ScrollView wrapper repeatedly in one test leaves state behind
 * that breaks every render after it.
 */
async function endMomentum(scroll: { props: Record<string, unknown> }, event: unknown) {
  await act(async () => {
    (scroll.props.onMomentumScrollEnd as (e: unknown) => void)(event);
  });
}

/** What the list reports when a finger stops the wheel dead. */
const stopped = (y: number) => ({
  nativeEvent: { contentOffset: { y }, velocity: { x: 0, y: 0 } },
});

/** What it reports when the wheel was flicked and momentum is about to run. */
const flicked = (y: number) => ({
  nativeEvent: { contentOffset: { y }, velocity: { x: 0, y: -1.4 } },
});

it('lists every option', async () => {
  await mount();
  for (const option of OPTIONS) {
    expect(screen.getByText(option.label)).toBeTruthy();
  }
});

it('renders the label above the wheel', async () => {
  await mount();
  expect(screen.getByText('Material')).toBeTruthy();
});

it('reports the option the wheel came to rest on', async () => {
  const { onChange, scroll } = await mount();
  fireEvent(scroll, 'momentumScrollEnd', stopped(2 * ITEM_HEIGHT));
  expect(onChange).toHaveBeenCalledWith('m2');
});

it('rounds a resting position between two rows to the nearer one', async () => {
  const { onChange, scroll } = await mount();
  fireEvent(scroll, 'momentumScrollEnd', stopped(1.7 * ITEM_HEIGHT));
  // A fast flick stops a few pixels off a row even with snapping.
  expect(onChange).toHaveBeenCalledWith('m2');
});

it('cannot come to rest past the end of the list', async () => {
  const { onChange, scroll } = await mount();
  fireEvent(scroll, 'momentumScrollEnd', stopped(40 * ITEM_HEIGHT));
  expect(onChange).toHaveBeenCalledWith('m3');
});

it('cannot come to rest above the top', async () => {
  const { onChange, scroll } = await mount('m3');
  fireEvent(scroll, 'momentumScrollEnd', stopped(-300));
  expect(onChange).toHaveBeenCalledWith(null);
});

it('says nothing when it lands back where it started', async () => {
  const { onChange, scroll } = await mount('m1');
  fireEvent(scroll, 'momentumScrollEnd', stopped(1 * ITEM_HEIGHT));
  expect(onChange).not.toHaveBeenCalled();
});

it('settles when the finger stopped the wheel dead', async () => {
  const { onChange, scroll } = await mount();
  await endDrag(scroll as never, stopped(2 * ITEM_HEIGHT));
  expect(onChange).toHaveBeenCalledWith('m2');
});

it('leaves a flick to momentum rather than settling it twice', async () => {
  const { onChange, scroll } = await mount();
  await endDrag(scroll as never, flicked(1 * ITEM_HEIGHT));
  // Settling on the drag ending is what made the wheel jump back mid-flick.
  expect(onChange).not.toHaveBeenCalled();

  fireEvent(scroll, 'momentumScrollEnd', stopped(3 * ITEM_HEIGHT));
  expect(onChange).toHaveBeenCalledWith('m3');
});

describe('putting itself straight', () => {
  it('leaves a wheel that already stopped dead on a row alone', async () => {
    const { onChange, scroll } = await mount();
    await endMomentum(scroll, stopped(2 * ITEM_HEIGHT));
    // Nothing to correct, so nothing to ignore afterwards either.
    await endMomentum(scroll, stopped(1 * ITEM_HEIGHT));
    expect(onChange).toHaveBeenNthCalledWith(1, 'm2');
    expect(onChange).toHaveBeenNthCalledWith(2, 'm1');
  });

  it('ignores the momentum its own correction sets off', async () => {
    const { onChange, scroll } = await mount();
    // Landing off a row makes it scroll itself straight, and that scroll ends
    // in a momentum event of its own. Acting on that one is a wheel that keeps
    // re-deciding where it is, forever.
    await endMomentum(scroll, stopped(2 * ITEM_HEIGHT + 12));
    expect(onChange).toHaveBeenCalledTimes(1);

    await endMomentum(scroll, stopped(0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('listens again to the next real gesture', async () => {
    const { onChange, scroll } = await mount();
    await endMomentum(scroll, stopped(2 * ITEM_HEIGHT + 12));
    await endMomentum(scroll, stopped(0)); // its own correction
    await endMomentum(scroll, stopped(1 * ITEM_HEIGHT));
    expect(onChange).toHaveBeenLastCalledWith('m1');
  });
});

it('picks the row that was tapped', async () => {
  const { onChange } = await mount();
  fireEvent(screen.getByText('Acrylic'), 'touchEnd');
  expect(onChange).toHaveBeenCalledWith('m3');
});

it('does not re-report a row that is already chosen when tapped', async () => {
  const { onChange } = await mount('m1');
  fireEvent(screen.getByText('MDF'), 'touchEnd');
  expect(onChange).not.toHaveBeenCalled();
});

it('does not rewrite a value that is not in the list yet', async () => {
  // A material still loading would otherwise silently read as "Any material",
  // while the sheet still counted the filter as set.
  const { onChange } = await mount('not-loaded-yet');
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps snapping on, so the wheel never rests between rows', async () => {
  const { scroll } = await mount();
  expect(scroll.props.snapToInterval).toBe(ITEM_HEIGHT);
  expect(scroll.props.decelerationRate).toBe('fast');
});

it('pads the list so the first and last options can reach the middle', async () => {
  const { scroll } = await mount();
  expect(scroll.props.contentContainerStyle.paddingVertical).toBe((ITEM_HEIGHT * 5 - ITEM_HEIGHT) / 2);
});

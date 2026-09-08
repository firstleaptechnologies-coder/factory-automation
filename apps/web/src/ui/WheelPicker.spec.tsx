import { render, screen, fireEvent, act } from '@testing-library/react';
import { WheelPicker } from './WheelPicker';

const ITEM_HEIGHT = 46;

const OPTIONS = [
  { id: null, label: 'Any material' },
  { id: 'm1', label: 'MDF', color: '#B98B54' },
  { id: 'm2', label: 'Plywood' },
  { id: 'm3', label: 'Acrylic' },
];

function mount(value: string | null = null) {
  const onChange = jest.fn();
  const view = render(
    <WheelPicker options={OPTIONS} value={value} onChange={onChange} label="Material" />,
  );
  const scroller = view.container.querySelector('.wheel-scroll') as HTMLElement;
  // jsdom does not lay out or scroll, so both are stood in for.
  scroller.scrollTo = ((options: { top: number }) => {
    scroller.scrollTop = options.top;
  }) as never;
  return { onChange, scroller, view };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** The wheel has no scroll-end event; a quiet period stands in for one. */
function scrollTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
  fireEvent.scroll(scroller);
  act(() => {
    jest.advanceTimersByTime(150);
  });
}

it('lists every option', () => {
  mount();
  for (const option of OPTIONS) {
    expect(screen.getByText(option.label)).toBeInTheDocument();
  }
});

it('starts on the selected option', () => {
  const { scroller } = mount('m2');
  expect(scroller.scrollTop).toBe(2 * ITEM_HEIGHT);
});

it('does not snap to the first option when the value is not in the list yet', () => {
  // A material still loading would otherwise silently read as "Any material".
  const { scroller, onChange } = mount('not-loaded-yet');
  expect(scroller.scrollTop).toBe(0);
  expect(onChange).not.toHaveBeenCalled();
});

it('reports the option the wheel came to rest on', () => {
  const { scroller, onChange } = mount();
  scrollTo(scroller, 2 * ITEM_HEIGHT);
  expect(onChange).toHaveBeenCalledWith('m2');
});

it('rounds a resting position between two rows to the nearer one', () => {
  const { scroller, onChange } = mount();
  scrollTo(scroller, Math.round(1.7 * ITEM_HEIGHT));
  expect(onChange).toHaveBeenCalledWith('m2');
});

it('snaps the wheel to the row it chose', () => {
  const { scroller } = mount();
  scrollTo(scroller, Math.round(1.7 * ITEM_HEIGHT));
  expect(scroller.scrollTop).toBe(2 * ITEM_HEIGHT);
});

it('cannot come to rest past the end of the list', () => {
  const { scroller, onChange } = mount();
  scrollTo(scroller, 40 * ITEM_HEIGHT);
  expect(onChange).toHaveBeenCalledWith('m3');
});

it('cannot come to rest above the top', () => {
  const { scroller, onChange } = mount('m3');
  scrollTo(scroller, -200);
  expect(onChange).toHaveBeenCalledWith(null);
});

it('says nothing when it lands back where it started', () => {
  const { scroller, onChange } = mount('m1');
  scrollTo(scroller, 1 * ITEM_HEIGHT);
  expect(onChange).not.toHaveBeenCalled();
});

it('settles once for a run of scroll events, not once each', () => {
  const { scroller, onChange } = mount();
  for (const top of [10, 30, 60, 92]) {
    scroller.scrollTop = top;
    fireEvent.scroll(scroller);
    act(() => {
      jest.advanceTimersByTime(50);
    });
  }
  act(() => {
    jest.advanceTimersByTime(150);
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('m2');
});

it('picks the row that was tapped', () => {
  const { onChange } = mount();
  fireEvent.click(screen.getByText('Acrylic'));
  expect(onChange).toHaveBeenCalledWith('m3');
});

it('does not re-report a row that is already chosen when tapped', () => {
  const { onChange } = mount('m1');
  fireEvent.click(screen.getByText('MDF'));
  expect(onChange).not.toHaveBeenCalled();
});

it('shows a colour dot for an option that has one', () => {
  const { view } = mount();
  expect(view.container.querySelectorAll('.wheel-dot')).toHaveLength(1);
});

it('renders the label above the wheel', () => {
  mount();
  expect(screen.getByText('Material')).toBeInTheDocument();
});

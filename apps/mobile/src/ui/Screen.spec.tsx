import { Text as RNText } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Screen } from './Screen';
import { spacing } from '../theme';

const flatten = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

const chain = () => {
  const out: Record<string, unknown>[] = [];
  let node = screen.getByText('Inside').parent;
  while (node) {
    if (node.props?.style) out.push(flatten(node.props.style));
    node = node.parent;
  }
  return out;
};

const has = (key: string, value: unknown) => chain().some((s) => s[key] === value);

const scrollEvent = (offset: number, height = 800, viewport = 700) => ({
  nativeEvent: {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 390, height },
    layoutMeasurement: { width: 390, height: viewport },
  },
});

/**
 * Driven directly rather than through fireEvent: firing a scroll event on the
 * host ScrollView corrupts the renderer for every later test in the file.
 */
const scroll = async (event: ReturnType<typeof scrollEvent>) => {
  const view = screen.getByTestId('screen-scroll');
  await act(async () => {
    view.props.onScroll?.(event);
  });
};

it('shows what it was given', async () => {
  await render(<Screen><RNText>Inside</RNText></Screen>);
  expect(screen.getByText('Inside')).toBeTruthy();
});

it('pads the sides so nothing touches the bezel', async () => {
  await render(<Screen><RNText>Inside</RNText></Screen>);
  expect(has('paddingHorizontal', spacing.lg)).toBe(true);
});

it('can be left unpadded for a screen that runs edge to edge', async () => {
  await render(<Screen padded={false}><RNText>Inside</RNText></Screen>);
  expect(has('paddingHorizontal', spacing.lg)).toBe(false);
});

it('leaves room under the content for the floating tab bar', async () => {
  await render(<Screen><RNText>Inside</RNText></Screen>);
  expect(has('paddingBottom', 120)).toBe(true);
});

it('drops that room on a screen with no tab bar under it', async () => {
  await render(<Screen tabBarPadding={false}><RNText>Inside</RNText></Screen>);
  expect(has('paddingBottom', spacing.xl)).toBe(true);
});

it('fills its parent when it does not scroll', async () => {
  await render(<Screen scroll={false}><RNText>Inside</RNText></Screen>);
  // Children that use flex — the punch keypad pinned to the bottom — have
  // nothing to size against otherwise and collapse to nothing.
  expect(has('flex', 1)).toBe(true);
});

it('does not scroll when it was told not to', async () => {
  await render(<Screen scroll={false}><RNText>Inside</RNText></Screen>);
  expect(screen.queryByTestId('screen-scroll')).toBeNull();
});

describe('pull to refresh', () => {
  it('offers none unless there is something to refresh', async () => {
    await render(<Screen><RNText>Inside</RNText></Screen>);
    expect(screen.getByTestId('screen-scroll').props.refreshControl).toBeUndefined();
  });

  it('refreshes when it is pulled', async () => {
    const onRefresh = jest.fn();
    await render(<Screen onRefresh={onRefresh}><RNText>Inside</RNText></Screen>);
    await fireEvent(screen.getByTestId('screen-scroll'), 'refresh');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows it is refreshing', async () => {
    await render(
      <Screen refreshing onRefresh={jest.fn()}><RNText>Inside</RNText></Screen>,
    );
    expect(screen.getByTestId('screen-scroll').props.refreshControl.props.refreshing).toBe(true);
  });
});

describe('reaching the end of a list', () => {
  it('is not watched for unless somebody asked', async () => {
    await render(<Screen><RNText>Inside</RNText></Screen>);
    expect(screen.getByTestId('screen-scroll').props.onScroll).toBeUndefined();
  });

  it('says nothing while the end is still far off', async () => {
    const onEndReached = jest.fn();
    await render(<Screen onEndReached={onEndReached}><RNText>Inside</RNText></Screen>);
    await scroll(scrollEvent(0, 4000, 700));
    expect(onEndReached).not.toHaveBeenCalled();
  });

  it('asks for the next page a screen early, before the list runs out', async () => {
    const onEndReached = jest.fn();
    await render(<Screen onEndReached={onEndReached}><RNText>Inside</RNText></Screen>);
    // 4000 tall, 700 viewport: 880 from the bottom is inside the 420 margin?
    await scroll(scrollEvent(2900, 4000, 700));
    expect(onEndReached).toHaveBeenCalled();
  });
});

describe('a bar that stays at the top', () => {
  it('is not there unless a screen asks for one', async () => {
    await render(<Screen><RNText>body</RNText></Screen>);
    expect(screen.queryByTestId('sticky-bar')).toBeNull();
  });

  it('pins the first child, which is the bar', async () => {
    await render(
      <Screen sticky={<RNText>search</RNText>}>
        <RNText>body</RNText>
      </Screen>,
    );
    // A list you are searching is a list you are working on; having to scroll
    // back up to change the search is what makes a long list tiring.
    expect(screen.getByTestId('screen-scroll').props.stickyHeaderIndices).toEqual([0]);
    expect(screen.getByText('search')).toBeTruthy();
  });

  it('gives the bar the top inset, since pinned it sits where the notch is', async () => {
    await render(<Screen sticky={<RNText>search</RNText>}><RNText>body</RNText></Screen>);
    const bar = Object.assign(
      {},
      ...[screen.getByTestId('sticky-bar').props.style].flat(Infinity).filter(Boolean),
    );
    expect(bar.paddingTop).toBeGreaterThan(0);
    // ...and the content below it starts flush against the bar rather than
    // clearing the notch a second time.
    expect(screen.getByTestId('screen-scroll').props.contentContainerStyle.paddingTop).toBe(0);
  });

  it('leaves the top inset on the content when there is no bar', async () => {
    await render(<Screen><RNText>body</RNText></Screen>);
    expect(
      screen.getByTestId('screen-scroll').props.contentContainerStyle.paddingTop,
    ).toBeGreaterThan(0);
  });

  it('paints the bar, so the list does not show through it', async () => {
    await render(<Screen sticky={<RNText>search</RNText>}><RNText>body</RNText></Screen>);
    const bar = Object.assign(
      {},
      ...[screen.getByTestId('sticky-bar').props.style].flat(Infinity).filter(Boolean),
    );
    expect(bar.backgroundColor).toBeTruthy();
  });
});

import { Text as RNText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Sheet, SheetOption } from './Sheet';
import { palette } from '../theme';

const flatten = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

const mount = (props: Record<string, unknown> = {}) =>
  render(
    <Sheet visible onClose={jest.fn()} {...props}>
      <RNText>Inside</RNText>
    </Sheet>,
  );

describe('Sheet', () => {
  it('shows nothing while it is closed', async () => {
    await render(
      <Sheet visible={false} onClose={jest.fn()}>
        <RNText>Inside</RNText>
      </Sheet>,
    );
    expect(screen.queryByText('Inside')).toBeNull();
  });

  it('shows what it was given once it is open', async () => {
    await mount();
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  it('carries a title and subtitle when it has them', async () => {
    await mount({ title: 'Pick a material', subtitle: 'Tap to choose' });
    expect(screen.getByText('Pick a material')).toBeTruthy();
    expect(screen.getByText('Tap to choose')).toBeTruthy();
  });

  it('has no header at all when it was given no title', async () => {
    await mount();
    expect(screen.queryByLabelText('Close')).toBeNull();
  });

  it('closes from the button', async () => {
    const onClose = jest.fn();
    await mount({ title: 'Pick a material', onClose });
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the dimmed area behind it is tapped', async () => {
    const onClose = jest.fn();
    await mount({ onClose });
    await fireEvent.press(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the system back gesture', async () => {
    const onClose = jest.fn();
    await mount({ onClose });
    await fireEvent(screen.getByTestId('sheet-surface'), 'requestClose');
    expect(onClose).toHaveBeenCalled();
  });

  it('stands taller when it holds a long list', async () => {
    await mount({ fullHeight: true });
    expect(flatten(screen.getByTestId('sheet-surface').props.style).height).toBe('88%');
  });

  it('leaves room under the last control for its glow', async () => {
    // A clipped accent halo reads as a broken shadow under the button.
    await mount();
    const body = flatten(screen.getByTestId('sheet-body').props.contentContainerStyle);
    expect(body.paddingBottom as number).toBeGreaterThan(40);
  });
});

describe('SheetOption', () => {
  it('shows a label, and a description when it has one', async () => {
    await render(<SheetOption label="Plywood" description="PLY · 18mm" onPress={jest.fn()} />);
    expect(screen.getByText('Plywood')).toBeTruthy();
    expect(screen.getByText('PLY · 18mm')).toBeTruthy();
  });

  it('runs what it was given', async () => {
    const onPress = jest.fn();
    await render(<SheetOption label="Plywood" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Plywood'));
    expect(onPress).toHaveBeenCalled();
  });

  it('marks the one already chosen', async () => {
    await render(<SheetOption label="Plywood" selected onPress={jest.fn()} />);
    const option = screen.getByLabelText('Plywood');
    expect(option.props.accessibilityState.selected).toBe(true);
    // The accent is runtime-configurable, so it is applied inline.
    expect(flatten(option.props.style).borderColor).toBe(palette.accent);
  });

  it('shows the colour a material or stage is drawn in', async () => {
    await render(<SheetOption label="Cutting" accent="#FF6B1A" onPress={jest.fn()} />);
    expect(flatten(screen.getByTestId('sheet-option-dot').props.style).backgroundColor)
      .toBe('#FF6B1A');
  });
});

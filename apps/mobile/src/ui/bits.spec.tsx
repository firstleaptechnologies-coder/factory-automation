import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  Avatar,
  EmptyState,
  IconTile,
  ListFooter,
  Loader,
  Pill,
  RoundButton,
  SectionHeader,
  ScreenHeader,
} from './bits';
import { INK_DARK } from '@decor/shared';
import { palette } from '../theme';

describe('Pill', () => {
  const colourOf = async (background?: string) => {
    const view = await render(<Pill label="Cutting" color={background} />);
    return JSON.stringify(view.toJSON());
  };

  it('writes dark text on a light status colour', async () => {
    // Status colours are configured per tenant; a dark label on a dark pill is
    // unreadable, and so is the reverse.
    expect(await colourOf('#FFFFFF')).toContain(INK_DARK);
  });

  it('writes light text on a dark status colour', async () => {
    expect(await colourOf('#1F2327')).toContain(palette.white);
  });

  it('falls back to a neutral pill when the status has no colour', async () => {
    expect(await colourOf(undefined)).toContain(palette.surfaceLit);
  });

  it('shrinks when it has to sit inside a card', async () => {
    const view = await render(<Pill label="Cutting" small />);
    expect(JSON.stringify(view.toJSON())).toContain('"fontSize":10');
  });
});

describe('ListFooter', () => {
  it('shows nothing at all for an empty list', async () => {
    const view = await render(<ListFooter loading={false} hasMore={false} shown={0} total={0} />);
    // The empty state speaks for itself; "All 0 orders" is noise.
    expect(view.toJSON()).toBeNull();
  });

  it('says how far through a long list the reader is', async () => {
    await render(<ListFooter loading={false} hasMore shown={20} total={137} noun="orders" />);
    expect(screen.getByText('20 of 137 orders')).toBeTruthy();
  });

  it('confirms when a list has genuinely ended', async () => {
    await render(<ListFooter loading={false} hasMore={false} shown={7} total={7} noun="orders" />);
    // Without this a finished list looks like one that failed to load more.
    expect(screen.getByText('All 7 orders')).toBeTruthy();
  });

  it('shows a spinner while the next page is in flight', async () => {
    const view = await render(<ListFooter loading hasMore shown={20} total={137} />);
    expect(JSON.stringify(view.toJSON())).toContain('ActivityIndicator');
    expect(screen.queryByText(/of 137/)).toBeNull();
  });
});

describe('Avatar', () => {
  it('shows the person’s initials', async () => {
    await render(<Avatar name="Nakul Varshney" />);
    expect(screen.getByText('NV')).toBeTruthy();
  });

  it('copes with a single name', async () => {
    await render(<Avatar name="Ramesh" />);
    expect(screen.getByText('R')).toBeTruthy();
  });
});

describe('Loader', () => {
  it('spins, with a word about what is happening', async () => {
    const view = await render(<Loader label="Loading orders" />);
    expect(JSON.stringify(view.toJSON())).toContain('ActivityIndicator');
    expect(screen.getByText('Loading orders')).toBeTruthy();
  });

  it('can spin without a caption', async () => {
    const view = await render(<Loader />);
    expect(JSON.stringify(view.toJSON())).toContain('ActivityIndicator');
  });
});

describe('EmptyState', () => {
  it('says what is missing and what to do about it', async () => {
    await render(<EmptyState title="No orders yet" message="Punch one from the tab below" />);
    expect(screen.getByText('No orders yet')).toBeTruthy();
    expect(screen.getByText('Punch one from the tab below')).toBeTruthy();
  });

  it('works with a title alone', async () => {
    await render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});

describe('ScreenHeader', () => {
  it('shows the title and subtitle', async () => {
    await render(<ScreenHeader title="ORD-2627-0002" subtitle="Verma Interiors" />);
    expect(screen.getByText('ORD-2627-0002')).toBeTruthy();
    expect(screen.getByText('Verma Interiors')).toBeTruthy();
  });

  it('offers a way back when there is somewhere to go', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader title="Order" onBack={onBack} />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('keeps the title centred when there is no back button', async () => {
    const view = await render(<ScreenHeader title="Home" />);
    // Two 46-wide spacers, so the title does not shift between screens.
    expect(JSON.stringify(view.toJSON()).match(/"width":46/g)).toHaveLength(2);
  });
});

describe('RoundButton', () => {
  it('reports a press', async () => {
    const onPress = jest.fn();
    await render(<RoundButton icon="back" onPress={onPress} accessibilityLabel="Back" />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('SectionHeader', () => {
  it('titles a section', async () => {
    await render(<SectionHeader title="Items" />);
    expect(screen.getByText('Items')).toBeTruthy();
  });
});

it('announces what an icon-only pad does', async () => {
  // Without this it reaches a screen reader as an unlabelled button.
  await render(<RoundButton icon="back" onPress={jest.fn()} accessibilityLabel="Back" />);
  expect(screen.getByLabelText('Back')).toBeTruthy();
});

describe('IconTile', () => {
  const labelOf = async (label: string) => {
    await render(<IconTile icon="card" label={label} onPress={jest.fn()} fluid />);
    return screen.getByText(label);
  };

  it('shrinks a long label rather than clipping it', async () => {
    const text = await labelOf('Transactions');
    // A tile is a fifth of the card and a single long word cannot wrap, so
    // "Transactions" came out as "Transactio…", which reads as a bug.
    expect(text.props.adjustsFontSizeToFit).toBe(true);
    expect(text.props.numberOfLines).toBe(1);
  });

  it('does not shrink below what stays readable', async () => {
    const text = await labelOf('Transactions');
    expect(text.props.minimumFontScale).toBe(0.75);
  });

  it('opens what it stands for', async () => {
    const onPress = jest.fn();
    await render(<IconTile icon="card" label="Transactions" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Transactions'));
    expect(onPress).toHaveBeenCalled();
  });
});

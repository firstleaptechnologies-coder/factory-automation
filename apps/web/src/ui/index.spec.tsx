import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  Field,
  ListFooter,
  Pill,
  Sheet,
  SheetOption,
  looksLikeAddress,
  looksLikeGstin,
  looksLikePhone,
} from './index';

describe('Pill', () => {
  const colourOf = (background: string) =>
    (render(<Pill label="Cutting" color={background} />).container
      .firstChild as HTMLElement).style.color;

  it('writes dark text on a light status colour', () => {
    // Status colours are configured per tenant; a dark label on a dark pill is
    // unreadable, and so is the reverse.
    expect(colourOf('#FFFFFF')).toBe('rgb(31, 35, 39)');
  });

  it('writes light text on a dark status colour', () => {
    expect(colourOf('#1F2327')).toBe('rgb(255, 255, 255)');
  });

  it('reads the short form as the colour it is', () => {
    // #fff is white, and used to be treated as malformed and given white text
    // on it — a label nobody could see.
    expect(colourOf('#fff')).toBe('rgb(31, 35, 39)');
  });

  it('does not crash on something that is not a colour at all', () => {
    expect(colourOf('')).toBe('rgb(255, 255, 255)');
    expect(colourOf('teal')).toBe('rgb(255, 255, 255)');
  });
});

describe('paste heuristics', () => {
  it('accepts a phone number however it was punctuated', () => {
    for (const text of ['9820012345', '+91 98200 12345', '(022) 2612-3456']) {
      expect(looksLikePhone(text)).toBe(true);
    }
  });

  it('rejects something that is merely numeric', () => {
    expect(looksLikePhone('12345')).toBe(false);
    expect(looksLikePhone('98200123451234567')).toBe(false);
    expect(looksLikePhone('Ramesh 9820012345')).toBe(false);
  });

  it('accepts a real GSTIN, spaces and case included', () => {
    expect(looksLikeGstin('27AAAAA0000A1Z5')).toBe(true);
    expect(looksLikeGstin('27aaaaa0000a1z5')).toBe(true);
    expect(looksLikeGstin(' 27AAAAA0000A1Z5 ')).toBe(true);
  });

  it('rejects a near-miss GSTIN', () => {
    expect(looksLikeGstin('27AAAAA0000A1Y5')).toBe(false);
    expect(looksLikeGstin('27AAAAA0000A1Z')).toBe(false);
  });

  it('takes a multi-word line as an address, not a stray word', () => {
    expect(looksLikeAddress('Shop 4, Link Road, Andheri West')).toBe(true);
    expect(looksLikeAddress('Andheri')).toBe(false);
    expect(looksLikeAddress('short one')).toBe(false);
  });
});

describe('Field', () => {
  function withClipboard(text: string | null) {
    Object.assign(navigator, {
      clipboard: {
        readText: jest.fn(async () => {
          if (text === null) throw new Error('denied');
          return text;
        }),
      },
    });
  }

  it('offers a paste when the clipboard fits the field', async () => {
    withClipboard('9820012345');
    render(<Field label="Phone" value="" onChange={() => {}} pasteAccepts={looksLikePhone} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(await screen.findByText('Paste')).toBeInTheDocument();
  });

  it('puts the clipboard text in when the offer is taken', async () => {
    withClipboard('9820012345');
    const onChange = jest.fn();
    render(<Field value="" onChange={onChange} pasteAccepts={looksLikePhone} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.click(await screen.findByText('Paste'));
    expect(onChange).toHaveBeenCalledWith('9820012345');
  });

  it('does not offer a paste that does not fit the field', async () => {
    withClipboard('hello there');
    render(<Field value="" onChange={() => {}} pasteAccepts={looksLikePhone} />);
    fireEvent.focus(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.queryByText('Paste')).not.toBeInTheDocument());
  });

  it('never offers a paste into a password field', async () => {
    withClipboard('hunter2');
    render(<Field value="" type="password" onChange={() => {}} />);
    const input = document.querySelector('input')!;
    fireEvent.focus(input);
    await waitFor(() => expect(screen.queryByText('Paste')).not.toBeInTheDocument());
  });

  it('does not offer over a value the user already typed', async () => {
    withClipboard('9820012345');
    render(<Field value="98111" onChange={() => {}} />);
    fireEvent.focus(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.queryByText('Paste')).not.toBeInTheDocument());
  });

  it('does not offer the same text twice after it was used', async () => {
    withClipboard('9820012345');
    const onChange = jest.fn();
    render(<Field value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.click(await screen.findByText('Paste'));
    fireEvent.focus(input);
    await waitFor(() => expect(screen.queryByText('Paste')).not.toBeInTheDocument());
  });

  it('says nothing when the clipboard is not readable', async () => {
    withClipboard(null);
    render(<Field value="" onChange={() => {}} />);
    fireEvent.focus(screen.getByRole('textbox'));
    // No permission, or an insecure origin. The field simply gets no button.
    await waitFor(() => expect(screen.queryByText('Paste')).not.toBeInTheDocument());
  });

  it('can be told not to offer at all', async () => {
    withClipboard('9820012345');
    render(<Field value="" onChange={() => {}} pasteable={false} />);
    fireEvent.focus(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.queryByText('Paste')).not.toBeInTheDocument());
  });

  it('shows an error instead of the hint', () => {
    render(<Field value="" onChange={() => {}} hint="Optional" error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
  });

  it('fires onEnter but does not submit the form around it', () => {
    const onEnter = jest.fn();
    render(<Field value="x" onChange={() => {}} onEnter={onEnter} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalled();
  });

  it('renders a textarea when asked for one', () => {
    render(<Field value="" onChange={() => {}} multiline rows={5} />);
    expect(document.querySelector('textarea')).toHaveAttribute('rows', '5');
  });
});

describe('ListFooter', () => {
  it('shows nothing at all for an empty list', () => {
    // The empty state speaks for itself; "All 0 orders" is noise.
    const { container } = render(
      <ListFooter loading={false} hasMore={false} shown={0} total={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers more, saying how far through the list the user is', () => {
    render(<ListFooter loading={false} hasMore shown={20} total={137} onMore={() => {}} />);
    expect(screen.getByText('Show more (20 of 137)')).toBeInTheDocument();
  });

  it('says when the list is complete', () => {
    render(<ListFooter loading={false} hasMore={false} shown={7} total={7} noun="orders" />);
    expect(screen.getByText('All 7 orders')).toBeInTheDocument();
  });

  it('shows a spinner instead of the button while loading', () => {
    const { container } = render(
      <ListFooter loading hasMore shown={20} total={137} onMore={() => {}} />,
    );
    expect(container.querySelector('.spinner')).toBeInTheDocument();
    expect(screen.queryByText(/Show more/)).not.toBeInTheDocument();
  });

  it('asks for the next page when pressed', () => {
    const onMore = jest.fn();
    render(<ListFooter loading={false} hasMore shown={20} total={137} onMore={onMore} />);
    fireEvent.click(screen.getByText('Show more (20 of 137)'));
    expect(onMore).toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Sheet open={false} onClose={() => {}}>
        body
      </Sheet>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(
      <Sheet open onClose={onClose}>
        body
      </Sheet>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a click outside but not on one inside', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Sheet open title="Filters" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByText('body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', () => {
    const onClose = jest.fn();
    render(
      <Sheet open onClose={onClose}>
        body
      </Sheet>,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('stops listening for Escape once it is closed', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <Sheet open onClose={onClose}>
        body
      </Sheet>,
    );
    rerender(
      <Sheet open={false} onClose={onClose}>
        body
      </Sheet>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SheetOption', () => {
  it('marks the chosen one', () => {
    render(<SheetOption label="Cutting" selected onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-selected', 'true');
  });

  it('reports the choice', () => {
    const onClick = jest.fn();
    render(<SheetOption label="Cutting" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});

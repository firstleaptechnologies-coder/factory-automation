import { render, screen } from '@testing-library/react';
import NewEstimatePage from './page';

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

jest.mock('@/components/EstimateForm', () => ({
  EstimateForm: (props: Record<string, unknown>) => (
    <div data-testid="form">{JSON.stringify(props)}</div>
  ),
}));

let query = '';
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query),
}));

beforeEach(() => {
  query = '';
});

it('opens the estimate form with nothing to edit', () => {
  render(<NewEstimatePage />);
  // No estimate id, so the form knows it is writing a new one rather than
  // loading one to change.
  expect(screen.getByTestId('form')).toHaveTextContent('{}');
});

it('keeps the app’s navigation around it', () => {
  render(<NewEstimatePage />);
  expect(screen.getByTestId('shell')).toContainElement(screen.getByTestId('form'));
});

describe('quoting an enquiry', () => {
  it('hands the form the enquiry it is quoting for', () => {
    query =
      'leadId=ld1&leadCode=LEAD-1&title=Kitchen+jali&clientId=c1&clientName=Verma&location=Andheri';
    render(<NewEstimatePage />);
    // Carried in the query string, so a half-written quote survives a reload
    // with the enquiry still attached to it.
    expect(JSON.parse(screen.getByTestId('form').textContent!).lead).toEqual({
      id: 'ld1',
      code: 'LEAD-1',
      title: 'Kitchen jali',
      clientId: 'c1',
      clientName: 'Verma',
      location: 'Andheri',
    });
  });

  it('leaves out what the enquiry did not carry', () => {
    query = 'leadId=ld1&leadCode=LEAD-1';
    render(<NewEstimatePage />);
    const { lead } = JSON.parse(screen.getByTestId('form').textContent!);
    expect(lead).toEqual({ id: 'ld1', code: 'LEAD-1' });
  });

  it('is an ordinary blank quote when no enquiry is named', () => {
    query = 'title=Something';
    render(<NewEstimatePage />);
    expect(screen.getByTestId('form')).toHaveTextContent('{}');
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nextNavigation } from '../../test/next-fakes';
import { LoginForm as LoginFormPage } from '@/app/(auth)/login/login-form';
import AppError from '@/app/(app)/error';
import GlobalError from '@/app/global-error';
import { ClientForm } from '@/features/clients/components/client-form';
import { MovementForm } from '@/features/movements/components/movement-form';
import { RangeFilter } from '@/features/reports/components/range-filter';
import { TotalsGrid } from '@/features/reports/components/totals-grid';
import type { FormState } from '@/lib/forms';
import { NavLink } from './layout/nav-link';
import { Button, ButtonLink } from './ui/button';
import { Field, Select, Textarea } from './ui/field';
import { Pagination } from './ui/pagination';
import { Alert, Amount, Badge, CardHeader, EmptyState, PageHeader, Stat } from './ui/primitives';
import { SubmitButton } from './ui/submit-button';

vi.mock('@/features/auth/actions', () => ({ loginAction: vi.fn() }));
const { loginAction } = await import('@/features/auth/actions');

const submit = async (label: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
};

describe('<ClientForm>', () => {
  it('prefills defaults, then shows errors while keeping what the user typed', async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: { email: 'Enter a valid email address' },
      values: { name: 'Typed name', email: 'bad', phone: '', notes: '' },
    }));
    render(
      <ClientForm
        action={action}
        defaults={{ name: 'Acme', email: null, notes: 'VIP' }}
        submitLabel="Save"
        cancelHref="/clients"
      />,
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Acme');
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Notes')).toHaveValue('VIP');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/clients');

    await submit('Save');
    await screen.findByText('Please correct the highlighted fields.');
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual(
      expect.arrayContaining(['Please correct the highlighted fields.', 'Enter a valid email address']),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Typed name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders empty when there are no defaults', () => {
    render(<ClientForm action={vi.fn()} submitLabel="Create" cancelHref="/clients" />);
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('<MovementForm>', () => {
  it('defaults to an earning dated today and shows success, keeping type and date', async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: 'success',
      message: 'Expense of $5.00 recorded.',
      values: { type: 'EXPENSE', occurredOn: '2026-11-01' },
    }));
    render(<MovementForm action={action} submitLabel="Add movement" today="2026-11-24" />);
    expect(screen.getByRole('radio', { name: 'Earning' })).toBeChecked();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-24');
    expect(screen.getByLabelText('Amount (USD)')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByRole('button', { name: 'Add movement' })).toHaveClass('w-full');

    await submit('Add movement');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Expense of $5.00 recorded.'));
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Amount (USD)')).toHaveValue('');
  });

  it('shows field errors, including for the type group, and a cancel link when editing', async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: { type: 'Choose earning or expense', amount: 'Amount must be greater than 0' },
      values: { amount: '0', description: 'x' },
    }));
    render(
      <MovementForm
        action={action}
        defaults={{ type: 'EXPENSE', amount: '10.00', occurredOn: '2026-01-02', description: 'Hosting' }}
        submitLabel="Save changes"
        cancelHref="/clients/abc"
        today="2026-11-24"
      />,
    );
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
    expect(screen.getByLabelText('Description')).toHaveValue('Hosting');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/clients/abc');

    await submit('Save changes');
    await waitFor(() => expect(screen.getByText('Choose earning or expense')).toBeInTheDocument());
    expect(screen.getByLabelText('Amount (USD)')).toHaveValue('0');
    expect(screen.getByLabelText('Amount (USD)')).toHaveAccessibleDescription('Amount must be greater than 0');
  });
});

describe('<MovementForm> errors without field details', () => {
  it('shows only the message', async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ status: 'error', message: 'Unknown client.' }));
    render(<MovementForm action={action} submitLabel="Add movement" today="2026-11-24" />);
    await submit('Add movement');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown client.');
    expect(screen.getByLabelText('Amount (USD)')).not.toHaveAttribute('aria-invalid');
  });
});

describe('<SubmitButton>', () => {
  it('asks for confirmation and cancels the submit when declined', async () => {
    const action = vi.fn();
    const onClick = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(
      <form action={action}>
        <SubmitButton confirmMessage="Delete it?" onClick={onClick}>
          Delete
        </SubmitButton>
      </form>,
    );
    await submit('Delete');
    expect(confirm).toHaveBeenCalledWith('Delete it?');
    expect(action).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();

    await submit('Delete');
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
  });

  it('disables itself and shows the pending label while the action runs', async () => {
    let finish: () => void = () => undefined;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <form action={action}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </form>,
    );
    await submit('Save');
    const pending = await screen.findByRole('button', { name: 'Saving…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  });

  it('falls back to its label when no pending label is given and respects disabled', async () => {
    let finish: () => void = () => undefined;
    render(
      <form action={() => new Promise<void>((resolve) => (finish = resolve))}>
        <SubmitButton>Go</SubmitButton>
        <SubmitButton disabled>Never</SubmitButton>
      </form>,
    );
    expect(screen.getByRole('button', { name: 'Never' })).toBeDisabled();
    await submit('Go');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('aria-busy', 'true'));
    await act(async () => finish());
  });
});

describe('<LoginForm>', () => {
  it('keeps the email and next path, never the password, and shows errors', async () => {
    vi.mocked(loginAction).mockResolvedValue({
      status: 'error',
      message: 'Invalid email or password.',
      fieldErrors: { password: 'Enter your password' },
      values: { email: 'a@test.local' },
    });
    render(<LoginFormPage next="/reports" />);
    expect(document.querySelector('input[name="next"]')).toHaveValue('/reports');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    await submit('Sign in');
    await waitFor(() => expect(screen.getByText('Invalid email or password.')).toBeInTheDocument());
    expect(screen.getByLabelText('Email')).toHaveValue('a@test.local');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('omits the next field when there is none', () => {
    render(<LoginFormPage />);
    expect(document.querySelector('input[name="next"]')).toBeNull();
  });
});

describe('<NavLink>', () => {
  it.each([
    ['/clients', 'page'],
    ['/clients/123/edit', 'page'],
    ['/clientsx', null],
    ['/reports', null],
  ])('on %s aria-current=%s', (pathname, current) => {
    nextNavigation.usePathname.mockReturnValue(pathname);
    render(<NavLink href="/clients">Clients</NavLink>);
    const link = screen.getByRole('link', { name: 'Clients' });
    if (current) expect(link).toHaveAttribute('aria-current', current);
    else expect(link).not.toHaveAttribute('aria-current');
  });
});

describe('<RangeFilter>', () => {
  it('links presets (preserving params, resetting page) and highlights the active one', () => {
    render(
      <RangeFilter
        basePath="/reports"
        range={{ preset: 'this-month', from: '2026-11-01', to: '2026-11-30' }}
        preserve={{ sort: 'balance_desc', empty: undefined }}
      />,
    );
    expect(screen.getByRole('link', { name: 'All time' })).toHaveAttribute('href', '/reports?sort=balance_desc');
    expect(screen.getByRole('link', { name: 'Last year' })).toHaveAttribute('href', '/reports?sort=balance_desc&range=last-year');
    expect(screen.getByRole('link', { name: 'This month' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-01');
    const hidden = [...document.querySelectorAll('input[type="hidden"]')].map((input) => [
      input.getAttribute('name'),
      input.getAttribute('value'),
    ]);
    expect(hidden).toEqual([['sort', 'balance_desc']]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('explains an invalid range', () => {
    render(<RangeFilter basePath="/reports" range={{ preset: 'all', error: 'Dates must be valid calendar dates.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Dates must be valid calendar dates. Showing all time instead.');
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'All time' })).toHaveAttribute('aria-current', 'true');
  });
});

describe('<TotalsGrid>', () => {
  const totals = {
    openingBalance: '10.00',
    totalEarnings: '5.00',
    totalExpenses: '2.00',
    net: '3.00',
    closingBalance: '13.00',
    movementCount: 1,
  };

  it('labels an all-time report', () => {
    render(<TotalsGrid totals={totals} isAllTime />);
    expect(screen.getByText('Start of records')).toBeInTheDocument();
    expect(screen.getByText('Current balance')).toBeInTheDocument();
    expect(screen.getByText('1 movement in range')).toBeInTheDocument();
    expect(screen.getByText('+$3.00')).toBeInTheDocument();
    expect(screen.getByText('$13.00')).toBeInTheDocument();
  });

  it('labels a ranged report', () => {
    render(<TotalsGrid totals={{ ...totals, movementCount: 2 }} isAllTime={false} />);
    expect(screen.getByText('Before the selected range')).toBeInTheDocument();
    expect(screen.getByText('At the end of the range')).toBeInTheDocument();
    expect(screen.getByText('2 movements in range')).toBeInTheDocument();
  });
});

describe('UI primitives', () => {
  it('renders amounts with sign and tone in text', () => {
    render(
      <>
        <Amount value="12.5" />
        <Amount value="0" signed />
        <Amount value="-3" signed />
      </>,
    );
    expect(screen.getByText('$12.50')).toHaveClass('text-positive');
    expect(screen.getByText('$0.00')).toHaveClass('text-fg');
    expect(screen.getByText('-$3.00')).toHaveClass('text-negative');
  });

  it('renders headers, stats, badges, alerts and empty states with optional parts', () => {
    render(
      <>
        <PageHeader title="Title" eyebrow="Eyebrow" description="Desc" actions={<button type="button">Act</button>} />
        <PageHeader title="Bare" />
        <CardHeader title="Card" description="Card desc" actions={<span>A</span>} />
        <CardHeader title="Bare card" />
        <dl>
          <Stat label="Stat" hint="Hint">
            1
          </Stat>
          <Stat label="No hint">2</Stat>
        </dl>
        <Badge>Neutral</Badge>
        <Badge tone="positive">Good</Badge>
        <Alert>Danger</Alert>
        <Alert tone="positive">Done</Alert>
        <EmptyState title="Empty" description="Nothing" action={<a href="/x">Add</a>} />
        <EmptyState title="Plain empty" />
      </>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Eyebrow')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Danger');
    expect(screen.getByRole('status')).toHaveTextContent('Done');
    expect(screen.getByText('Good')).toHaveClass('text-positive');
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  it('renders buttons, links and form controls', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Plain</Button>
        <Button type="submit" variant="danger" size="sm">
          Danger
        </Button>
        <ButtonLink href="/clients">Link</ButtonLink>
        <ButtonLink href="/clients" variant="primary" size="sm">
          Primary link
        </ButtonLink>
        <Field label="Choice" hint="Pick one">
          {(props) => (
            <Select {...props}>
              <option>A</option>
            </Select>
          )}
        </Field>
        <Field label="Text">{(props) => <Textarea {...props} />}</Field>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plain' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('href', '/clients');
    expect(screen.getByLabelText('Choice')).toHaveAccessibleDescription('Pick one');
    expect(screen.getByLabelText('Text')).not.toHaveAttribute('aria-describedby');
  });

  it('pagination disables the edges and hides navigation for a single page', () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={2} totalItems={30} pageSize={20} hrefFor={(p) => `/clients?page=${p}`} />,
    );
    expect(screen.getByText('← Previous')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/clients?page=2');
    rerender(<Pagination page={2} totalPages={2} totalItems={30} pageSize={20} hrefFor={(p) => `/clients?page=${p}`} />);
    expect(screen.getByText('Next →')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('navigation')).toHaveTextContent('Showing 21–30 of 30 items');
    rerender(<Pagination page={1} totalPages={1} totalItems={3} pageSize={20} hrefFor={(p) => `/clients?page=${p}`} />);
    expect(screen.queryByText(/Previous/)).not.toBeInTheDocument();
  });
});

describe('error boundaries', () => {
  it('app error boundary hides details, shows the digest and retries', () => {
    const reset = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('SELECT * FROM secrets failed'), { digest: 'abc123' });
    render(<AppError error={error} reset={reset} />);
    expect(screen.queryByText(/secrets/)).not.toBeInTheDocument();
    expect(screen.getByText('Reference: abc123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(error);
    log.mockRestore();
  });

  it('app error boundary without a digest', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppError error={new Error('x')} reset={vi.fn()} />);
    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
    log.mockRestore();
  });

  it('global error boundary renders a full document with a retry button', () => {
    const reset = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<GlobalError error={new Error('root failed')} reset={reset} />, { container: document.documentElement });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading')).toHaveTextContent('Client Ledger is temporarily unavailable');
    log.mockRestore();
  });
});

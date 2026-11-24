import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { Field, Input } from './field';
import { Pagination, withQuery } from './pagination';
import { Amount } from './primitives';

describe('formatting', () => {
  it('formats money and signed money', () => {
    expect(formatMoney('1250.5')).toBe('$1,250.50');
    expect(formatSignedMoney('-20')).toBe('-$20.00');
    expect(formatSignedMoney('20')).toBe('+$20.00');
    expect(formatSignedMoney('0')).toBe('$0.00');
  });

  it('formats calendar dates without shifting them across time zones', () => {
    // The test runs with TZ=America/New_York, where naive parsing would show Nov 23.
    expect(formatDate('2026-11-24')).toBe('Nov 24, 2026');
  });
});

describe('<Amount>', () => {
  it('conveys sign in text, not only colour', () => {
    render(<Amount value="-12.30" signed />);
    expect(screen.getByText('-$12.30')).toHaveClass('text-negative');
  });
});

describe('<Field>', () => {
  it('links the error message to the control for screen readers', () => {
    render(
      <Field label="Email" error="Enter a valid email address">
        {(props) => <Input {...props} name="email" />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address');
  });
});

describe('<Pagination>', () => {
  it('renders the visible range and accessible navigation', () => {
    render(
      <Pagination
        page={2}
        totalPages={3}
        totalItems={45}
        pageSize={20}
        noun="clients"
        hrefFor={(p) => withQuery('/clients', { page: p })}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Showing 21–40 of 45 clients');
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/clients?page=1');
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/clients?page=3');
  });

  it('renders nothing for empty lists', () => {
    const { container } = render(<Pagination page={1} totalPages={1} totalItems={0} pageSize={20} hrefFor={() => '/clients'} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('omits empty query params', () => {
    expect(withQuery('/reports', { from: undefined, sort: '', page: 2 })).toBe('/reports?page=2');
  });
});

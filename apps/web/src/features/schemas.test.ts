import { describe, expect, it } from 'vitest';
import { ClientFormSchema, toClientPayload } from './clients/schemas';
import { MovementFormSchema } from './movements/schemas';

describe('MovementFormSchema', () => {
  const base = { type: 'EARNING', occurredOn: '2026-11-24', description: 'Invoice' };

  it('normalises human-typed amounts to an exact decimal string', () => {
    expect(MovementFormSchema.parse({ ...base, amount: '1,250.50' }).amount).toBe('1250.50');
    expect(MovementFormSchema.parse({ ...base, amount: ' 42 ' }).amount).toBe('42');
  });

  it.each(['0', '0.00', '-5', '1.234', 'abc', '', '1e5'])('rejects amount %j', (amount) => {
    expect(MovementFormSchema.safeParse({ ...base, amount }).success).toBe(false);
  });

  it('rejects unknown types and impossible dates', () => {
    expect(MovementFormSchema.safeParse({ ...base, amount: '1', type: 'REFUND' }).success).toBe(false);
    expect(MovementFormSchema.safeParse({ ...base, amount: '1', occurredOn: '2026-02-30' }).success).toBe(false);
  });
});

describe('ClientFormSchema', () => {
  it('turns empty optional fields into nulls for the API', () => {
    const parsed = ClientFormSchema.parse({ name: ' Acme ', email: '', phone: '', notes: '' });
    expect(toClientPayload(parsed)).toEqual({ name: 'Acme', email: null, phone: null, notes: null });
  });

  it('lower-cases emails and validates phones', () => {
    expect(ClientFormSchema.parse({ name: 'A', email: 'A@B.TEST' }).email).toBe('a@b.test');
    expect(ClientFormSchema.safeParse({ name: 'A', phone: 'call me' }).success).toBe(false);
  });
});

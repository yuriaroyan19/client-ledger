import { describe, expect, it } from 'vitest';
import { fieldErrorsFrom, toProblem } from './api/problem';
import { isPublicPath, safeNextPath } from './auth/constants';

describe('safeNextPath (open-redirect protection)', () => {
  it.each([
    ['/clients/123?range=this-month', '/clients/123?range=this-month'],
    ['/reports', '/reports'],
  ])('allows same-site path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    '/login',
    '/logout?x=1',
  ])('rejects %j', (input) => {
    expect(safeNextPath(input)).toBe('/clients');
  });
});

describe('isPublicPath', () => {
  it('only exposes login, logout and health', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/api/health')).toBe(true);
    expect(isPublicPath('/loginx')).toBe(false);
    expect(isPublicPath('/clients')).toBe(false);
    expect(isPublicPath('/exports/overview')).toBe(false);
  });
});

describe('API problems', () => {
  it('maps API issue paths to form fields', () => {
    expect(
      fieldErrorsFrom({
        status: 422,
        issues: [
          { path: 'body.email', message: 'Invalid email' },
          { path: 'body.email', message: 'second message ignored' },
          { path: 'body', message: 'Unrecognized key' },
        ],
      }),
    ).toEqual({ email: 'Invalid email', _form: 'Unrecognized key' });
  });

  it('never surfaces raw upstream bodies for non-problem responses', () => {
    expect(toProblem(502, '<html>Bad gateway</html>')).toEqual({
      status: 502,
      detail: 'The server could not complete the request.',
    });
  });
});

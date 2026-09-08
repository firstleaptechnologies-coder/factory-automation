import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function host(request: Record<string, unknown> = {}) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/orders', ...request }),
      }),
    } as never,
    status,
    json,
  };
}

/** Silence the logger; these tests are about what the caller is handed. */
beforeEach(() => {
  jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('answers the caller', () => {
  it('passes a refusal through in the words it was written in', () => {
    const { host: h, status, json } = host();
    new AllExceptionsFilter().catch(
      new BadRequestException('This order is already delivered'),
      h,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].message).toBe('This order is already delivered');
  });

  it('says nothing about an error it did not expect', () => {
    const { host: h, status, json } = host();
    new AllExceptionsFilter().catch(
      new Error('connect ECONNREFUSED 10.0.0.4:5432, password=hunter2'),
      h,
    );

    expect(status).toHaveBeenCalledWith(500);
    // An unhandled message is as likely to hold a connection string as
    // anything a shop should read.
    expect(json.mock.calls[0][0].message).not.toContain('hunter2');
    expect(json.mock.calls[0][0].message).toMatch(/something went wrong/i);
  });

  it('gives every answer a reference to quote back', () => {
    const { host: h, json } = host();
    new AllExceptionsFilter().catch(new BadRequestException('No'), h);
    expect(json.mock.calls[0][0].reference).toMatch(/^[0-9a-f]{8}$/);
  });

  it('gives a different reference each time', () => {
    const first = host();
    const second = host();
    const filter = new AllExceptionsFilter();
    filter.catch(new Error('one'), first.host);
    filter.catch(new Error('two'), second.host);

    expect(first.json.mock.calls[0][0].reference).not.toBe(
      second.json.mock.calls[0][0].reference,
    );
  });

  it('keeps the validation pipe’s list of what was wrong', () => {
    const { host: h, json } = host();
    new AllExceptionsFilter().catch(
      new BadRequestException({
        statusCode: 400,
        message: ['name should not be empty', 'rate must be a number'],
        error: 'Bad Request',
      }),
      h,
    );

    expect(json.mock.calls[0][0].message).toEqual([
      'name should not be empty',
      'rate must be a number',
    ]);
  });
});

describe('what gets logged', () => {
  it('logs a fault, whether or not it arrived as an HttpException', () => {
    const logged = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const filter = new AllExceptionsFilter();
    filter.catch(new InternalServerErrorException('disk full'), host().host);
    filter.catch(new BadRequestException('nope'), host().host);

    // The 400 is the caller being told no, not something to investigate.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain('POST /api/orders');
  });

  it('names the workspace and the user, so a report can be placed', () => {
    const logged = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    new AllExceptionsFilter().catch(new Error('boom'), host({ user: { id: 'u7' } }).host);

    expect(String(logged.mock.calls[0][0])).toContain('user u7');
  });
});

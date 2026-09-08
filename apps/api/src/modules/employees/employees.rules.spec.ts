import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmployeeDto } from './dto/employee.dto';
import { EmployeesService, employeeFilter } from './employees.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const PERSON = {
  name: 'Ramesh Kumar',
  phone: '9876543210',
  designation: 'CNC operator',
  department: 'Production',
  joinedOn: '2026-04-01',
};

function build() {
  const db = prismaMock() as never as Db;
  const encryption = {
    encrypt: jest.fn((value: string) => `enc(${value})`),
    decryptToString: jest.fn((envelope: string) => envelope.replace(/^enc\(|\)$/g, '')),
  };
  const codes = { next: jest.fn(async () => 'EMP-0001') };
  db.employee.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'e1',
    ...data,
  }));
  db.employee.update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'e1',
    ...data,
  }));
  return {
    service: new EmployeesService(db as never, encryption as never, codes as never),
    db,
    encryption,
    codes,
  };
}

const dto = (over: Record<string, unknown> = {}) => ({ ...PERSON, ...over }) as never;

describe('an employee is not a login', () => {
  it('is created without one, because most of the floor will never have one', async () => {
    const { service, db } = build();
    await inTenant(() => service.create(dto()));
    expect(db.employee.create.mock.calls[0][0].data.userId).toBeNull();
  });

  it('links to one when there is one', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => ({ id: 'u1' }));
    await inTenant(() => service.create(dto({ userId: 'u1' })));
    expect(db.employee.create.mock.calls[0][0].data.userId).toBe('u1');
  });

  it('refuses a link to a login that does not exist', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() => service.create(dto({ userId: 'ghost' }))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('numbers people without the financial year', async () => {
    const { service, codes } = build();
    await inTenant(() => service.create(dto()));
    expect(codes.next).toHaveBeenCalledWith('employee');
  });
});

describe('what is kept secret, and what is shown', () => {
  it('encrypts the identifiers and keeps only the last four in clear', async () => {
    const { service, db, encryption } = build();
    await inTenant(() =>
      service.create(dto({ aadhaar: '123412341234', pan: 'abcde1234f' })),
    );
    const written = db.employee.create.mock.calls[0][0].data;
    expect(encryption.encrypt).toHaveBeenCalledWith('123412341234');
    expect(written.aadhaar).toBe('enc(123412341234)');
    expect(written.aadhaarLast4).toBe('1234');
    // A PAN is upper case wherever it is printed.
    expect(written.pan).toBe('enc(ABCDE1234F)');
    expect(written.panLast4).toBe('234F');
  });

  it('strips the spaces people type into an Aadhaar', async () => {
    const { service, db } = build();
    await inTenant(() => service.create(dto({ aadhaar: '1234 1234 1234' })));
    expect(db.employee.create.mock.calls[0][0].data.aadhaarLast4).toBe('1234');
  });

  it('leaves what is stored alone when an edit does not mention it', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1' }));
    await inTenant(() => service.update('e1', dto({ aadhaar: undefined })));
    /*
     * The form cannot show what it does not have — these are encrypted and
     * come back as four digits — so treating absence as "clear it" would wipe
     * the Aadhaar of anybody whose phone number was corrected.
     */
    const written = db.employee.update.mock.calls[0][0].data;
    expect('aadhaar' in written).toBe(false);
    expect('aadhaarLast4' in written).toBe(false);
  });

  it('clears one that is sent empty, tail and all', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1' }));
    await inTenant(() => service.update('e1', dto({ aadhaar: '' })));
    // A stale last-four beside a removed number looks like the number is still
    // there, which is worse than showing nothing.
    const written = db.employee.update.mock.calls[0][0].data;
    expect(written.aadhaar).toBeNull();
    expect(written.aadhaarLast4).toBeNull();
  });

  it('never sends the whole number back with the employee', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1' }));
    await service.get('e1');
    const selected = db.employee.findFirst.mock.calls[0][0].select;
    expect(selected.aadhaar).toBeUndefined();
    expect(selected.pan).toBeUndefined();
    expect(selected.bankAccountNumber).toBeUndefined();
    expect(selected.aadhaarLast4).toBe(true);
  });

  it('decrypts them only when they are asked for by name', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({
      aadhaar: 'enc(123412341234)',
      pan: null,
      bankAccountNumber: 'enc(50100123456789)',
    }));
    await expect(service.identifiers('e1')).resolves.toEqual({
      aadhaar: '123412341234',
      pan: null,
      bankAccountNumber: '50100123456789',
    });
  });
});

describe('somebody leaving', () => {
  it('keeps the row and switches the login off', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1', userId: 'u1' }));
    await inTenant(() => service.markLeft('e1', '2026-09-30'));

    // Last year's attendance and last month's payslip hang off this row.
    expect(db.employee.delete).not.toHaveBeenCalled();
    expect(db.employee.update.mock.calls[0][0].data).toMatchObject({
      status: 'LEFT',
      leftOn: new Date('2026-09-30T00:00:00.000Z'),
    });
    expect(db.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'u1' },
      data: { isActive: false },
    });
  });

  it('reads the person back after the login was switched off, not before', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1', userId: 'u1' }));
    await inTenant(() => service.markLeft('e1', '2026-09-30'));
    // Otherwise the answer says the account is still active, having been read
    // inside the same transaction that was about to disable it.
    expect(db.employee.findFirst).toHaveBeenCalledTimes(2);
  });

  it('copes with somebody who never had a login', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1', userId: null }));
    await inTenant(() => service.markLeft('e1', '2026-09-30'));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('will not mark the same person left twice', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => ({ id: 'e1', status: 'LEFT' }));
    await expect(
      inTenant(() => service.markLeft('e1', '2026-09-30')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('insists on a leaving date when the status says they have', async () => {
    const { service } = build();
    await expect(
      inTenant(() => service.create(dto({ status: 'LEFT' }))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('who counts as the staff', () => {
  it('leaves out the people who have gone, unless asked', () => {
    // The list is nearly always "who works here", not "who ever did".
    expect(employeeFilter({}).status).toEqual({ not: 'LEFT' });
    expect(employeeFilter({ status: 'LEFT' as never }).status).toBe('LEFT');
  });

  it('searches the things somebody would actually type', () => {
    const where = employeeFilter({ search: 'ramesh' });
    const asked = JSON.stringify(where.OR);
    for (const field of ['name', 'code', 'phone', 'designation']) {
      expect(asked).toContain(field);
    }
  });

  it('narrows to one department when asked', () => {
    expect(employeeFilter({ department: 'Production' })).toMatchObject({
      department: 'Production',
    });
  });
});

describe('the shape the form sends', () => {
  it('accepts an identifier as it is printed on the card', async () => {
    const dto = plainToInstance(EmployeeDto, {
      name: 'Ramesh Kumar',
      joinedOn: '2026-04-01',
      aadhaar: '1234 1234 1234',
      pan: 'abcde1234f',
      bankIfsc: 'hdfc0001234',
    });
    // Refusing what somebody copied off the card would be pedantry rather
    // than validation.
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.aadhaar).toBe('123412341234');
    expect(dto.pan).toBe('ABCDE1234F');
  });

  it('still refuses one that is genuinely wrong', async () => {
    const dto = plainToInstance(EmployeeDto, {
      name: 'Ramesh Kumar',
      joinedOn: '2026-04-01',
      aadhaar: '12341234',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['aadhaar']);
  });

  it('lets an empty one through, because that is how one is removed', async () => {
    // Somebody who typed the wrong person's PAN has to be able to take it off.
    const dto = plainToInstance(EmployeeDto, {
      name: 'Ramesh Kumar',
      joinedOn: '2026-04-01',
      pan: '',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});

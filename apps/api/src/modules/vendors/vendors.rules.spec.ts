import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VendorsService, rowFrom, vendorFilter } from './vendors.service';
import { VendorDto } from './dto/vendor.dto';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  const codes = { next: jest.fn(async () => 'VEN-0001') };
  db.vendor.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'v1',
    ...data,
  }));
  db.vendor.update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'v1',
    ...data,
  }));
  return { service: new VendorsService(db as never, codes as never), db, codes };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({ name: 'Verma Boards', ...over }) as never;

describe('adding one', () => {
  it('numbers them like a party, not like a document', async () => {
    const { service, codes } = build();
    await inTenant(() => service.create(dto()));
    // A vendor whose number changed every April would be no use to anybody.
    expect(codes.next).toHaveBeenCalledWith('vendor');
  });

  it('stores a GSTIN as it is printed', () => {
    expect(rowFrom(dto({ gstin: '08aaach7409r1zs' }) as never).gstin).toBe(
      '08AAACH7409R1ZS',
    );
  });

  it('turns an empty field into nothing rather than a blank string', () => {
    // A blank phone number sorts and searches as if somebody had one.
    expect(rowFrom(dto({ phone: '   ' }) as never).phone).toBeNull();
  });
});

describe('retiring one', () => {
  it('keeps the row, because every purchase still hangs off it', async () => {
    const { service, db } = build();
    db.vendor.findFirst = jest.fn(async () => ({ id: 'v1', isActive: true }));
    await service.retire('v1');
    expect(db.vendor.delete).not.toHaveBeenCalled();
    expect(db.vendor.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  it('will not retire the same vendor twice', async () => {
    const { service, db } = build();
    db.vendor.findFirst = jest.fn(async () => ({ id: 'v1', isActive: false }));
    await expect(service.retire('v1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses one that is not there', async () => {
    const { service, db } = build();
    db.vendor.findFirst = jest.fn(async () => null);
    await expect(service.retire('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('who can be ordered from', () => {
  it('leaves the retired ones out unless they are asked for', () => {
    // The list is nearly always "who can we order from", not "who ever
    // supplied us".
    expect(vendorFilter({}).isActive).toBe(true);
    expect(vendorFilter({ includeInactive: true }).isActive).toBeUndefined();
  });

  it('searches what somebody would actually type', () => {
    const asked = JSON.stringify(vendorFilter({ search: 'ply' }).OR);
    for (const field of ['name', 'code', 'phone', 'company', 'supplies']) {
      expect(asked).toContain(field);
    }
  });
});

describe('the shape the form sends', () => {
  it('refuses a GSTIN that is not one', async () => {
    // A wrong GSTIN on a purchase bill is input credit the shop does not get,
    // found either today or a quarter later.
    const errors = await validate(
      plainToInstance(VendorDto, { name: 'Verma Boards', gstin: '08AAACH' }),
    );
    expect(errors.map((e) => e.property)).toEqual(['gstin']);
  });

  it('takes a real one', async () => {
    await expect(
      validate(plainToInstance(VendorDto, { name: 'Verma Boards', gstin: '08AAACH7409R1ZS' })),
    ).resolves.toEqual([]);
  });

  it('lets an empty one through, because that is how one is removed', async () => {
    await expect(
      validate(plainToInstance(VendorDto, { name: 'Verma Boards', gstin: '' })),
    ).resolves.toEqual([]);
  });
});

describe('a GSTIN as it is actually typed', () => {
  it('takes one in lower case, because it is copied off a bill', async () => {
    // Refusing what is on the paper would be pedantry rather than validation.
    const dto = plainToInstance(VendorDto, {
      name: 'Verma Boards',
      gstin: '08aaach7409r1zs',
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.gstin).toBe('08AAACH7409R1ZS');
  });

  it('takes one with the spacing somebody left in', async () => {
    const dto = plainToInstance(VendorDto, {
      name: 'Verma Boards',
      gstin: ' 08AAACH7409R1ZS ',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});

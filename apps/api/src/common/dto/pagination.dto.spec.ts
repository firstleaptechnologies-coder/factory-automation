import { PaginationDto, paginate } from './pagination.dto';

describe('PaginationDto', () => {
  it('starts at page one with a sane page size', () => {
    const dto = new PaginationDto();
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(25);
    expect(dto.skip).toBe(0);
  });

  it('skips whole pages', () => {
    const dto = new PaginationDto();
    dto.page = 3;
    dto.limit = 25;
    expect(dto.skip).toBe(50);
  });
});

describe('paginate', () => {
  it('reports how many pages the rows fill', () => {
    expect(paginate([1, 2], 5, { page: 1, limit: 2 }).meta).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      pages: 3,
    });
  });

  it('reports one page when there is nothing', () => {
    // Zero pages would render as "page 1 of 0", which reads as a broken list.
    expect(paginate([], 0, { page: 1, limit: 25 }).meta.pages).toBe(1);
  });

  it('does not invent a second page for an exact fit', () => {
    expect(paginate([1, 2], 50, { page: 1, limit: 25 }).meta.pages).toBe(2);
    expect(paginate([1], 25, { page: 1, limit: 25 }).meta.pages).toBe(1);
  });
});

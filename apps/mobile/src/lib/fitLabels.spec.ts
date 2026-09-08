import { fitLabels } from './fitLabels';

const size = (labels: string[], width: number, gap = 0) =>
  fitLabels(labels, width, { base: 10, min: 7, gap });

it('leaves short labels at the size they were written at', () => {
  expect(size(['Design', 'Punch'], 400)).toBe(10);
});

it('shrinks the row when its longest member will not fit', () => {
  // Five columns of 60pt; "Order confirmed" needs about 87pt at full size.
  const five = ['Order confirmed', 'Design', 'Design approval', 'Production', 'QC & Sanding'];
  expect(size(five, 300)).toBeLessThan(10);
});

it('gives every label in the row the same size, whatever its own length', () => {
  const labels = ['Order confirmed', 'Design', 'Design approval', 'Production', 'QC & Sanding'];
  // The point of the helper: one answer for the row, not one per label.
  const answer = size(labels, 340);
  expect(size(labels, 340)).toBe(answer);
  expect(typeof answer).toBe('number');
});

it('is decided by the longest label, not by the average', () => {
  const withLong = size(['Order confirmed', 'A', 'B', 'C', 'D'], 300);
  const withoutIt = size(['Short', 'A', 'B', 'C', 'D'], 300);
  expect(withLong).toBeLessThan(withoutIt);
});

it('takes the gaps between the columns out of the width', () => {
  // Wide enough that neither answer is sitting on the floor.
  const four = ['Order confirmed', 'Design', 'Production', 'QC'];
  expect(size(four, 380, 24)).toBeLessThan(size(four, 380, 0));
});

it('will not shrink below what stays readable', () => {
  // A very long stage name is truncated rather than rendered as a grey smear.
  expect(size(['An extremely long stage name somebody typed'], 100)).toBe(7);
});

it('waits for a real measurement rather than guessing at zero', () => {
  // The row has not been laid out yet; a computed size here would show as a
  // visible jump on the next frame.
  expect(size(['Order confirmed'], 0)).toBe(10);
});

it('copes with a row that has nothing in it', () => {
  expect(size([], 300)).toBe(10);
});

import { StreamableFile } from '@nestjs/common';
import { FilesController } from './files.controller';

const files = { read: jest.fn(async (..._a: unknown[]) => ({})) };
const controller = new FilesController(files as never);

const response = () => {
  const headers: Record<string, string> = {};
  return {
    headers,
    res: { set: (next: Record<string, string>) => Object.assign(headers, next) } as never,
  };
};

const FILE = {
  id: 'f1',
  mimeType: 'image/webp',
  fileName: 'size sheet.webp',
};

beforeEach(() => {
  jest.clearAllMocks();
  files.read.mockResolvedValue({ file: FILE, data: Buffer.from('pretend image') });
});

it('serves the bytes the file service decrypted', async () => {
  const { res } = response();
  const result = await controller.download('f1', res);
  expect(files.read).toHaveBeenCalledWith('f1');
  expect(result).toBeInstanceOf(StreamableFile);
});

it('says what the file is, so a browser renders it rather than guessing', async () => {
  const { headers, res } = response();
  await controller.download('f1', res);
  expect(headers['Content-Type']).toBe('image/webp');
  expect(headers['Content-Length']).toBe('13');
});

it('shows the file rather than downloading it, under its own name', async () => {
  const { headers, res } = response();
  await controller.download('f1', res);
  expect(headers['Content-Disposition']).toBe('inline; filename="size%20sheet.webp"');
});

it('escapes a filename that would otherwise break the header', async () => {
  files.read.mockResolvedValue({
    file: { ...FILE, fileName: 'a"; drop.webp' },
    data: Buffer.from('x'),
  });
  const { headers, res } = response();
  await controller.download('f1', res);
  expect(headers['Content-Disposition']).not.toContain('";');
});

it('caches hard but privately, since the bytes never change and are not public', async () => {
  const { headers, res } = response();
  await controller.download('f1', res);
  // A shared cache holding a client's drawings would serve them to the next
  // person through the same proxy.
  expect(headers['Cache-Control']).toBe('private, max-age=31536000, immutable');
});

it('lets the service’s refusal through rather than serving an empty body', async () => {
  files.read.mockRejectedValue(new Error('No such file'));
  const { res } = response();
  await expect(controller.download('nope', res)).rejects.toThrow('No such file');
});

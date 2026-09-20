import { manualFor, manualHtml, platformModules, workspaceModules } from './index';
import { PRODUCT_MANUAL } from './product-manual.generated';

/**
 * The exported manual is the one thing here a customer holds. It has to be
 * complete for what they bought, silent about what they did not, and silent
 * about us.
 */
describe('the manual a vendor is sent', () => {
  const sold = workspaceModules(PRODUCT_MANUAL).map((m) => m.key);

  it('covers the modules that were chosen', () => {
    const cut = manualFor(PRODUCT_MANUAL, ['orders', 'clients']);
    expect(cut.modules.map((m) => m.key).sort()).toEqual(['clients', 'orders']);
  });

  it('leaves out a module the shop did not buy', () => {
    const cut = manualFor(PRODUCT_MANUAL, ['orders']);
    const html = manualHtml(cut);
    // A shop with no Purchasing that is handed thirty pages about Purchasing
    // will either try to use it or ask why it is missing.
    expect(html).not.toMatch(/Vendors, purchase orders/);
  });

  /*
   * What FirstLeap does above a shop is not a shop's business: who else is a
   * client, what they pay, how the app is released. It is not merely unticked
   * by default — it cannot be ticked.
   */
  it('cannot include the console, however it is asked', () => {
    const cut = manualFor(PRODUCT_MANUAL, [...sold, 'platform']);
    expect(cut.modules.map((m) => m.key)).not.toContain('platform');
    expect(manualHtml(cut)).not.toMatch(/FirstLeap console/);
  });

  it('knows the console is ours', () => {
    expect(platformModules(PRODUCT_MANUAL).map((m) => m.key)).toEqual(['platform']);
  });

  it('is one file, with nothing to fetch', () => {
    const html = manualHtml(manualFor(PRODUCT_MANUAL, sold));
    // It has to open in five years on a laptop in a workshop with no internet.
    expect(html).not.toMatch(/<link[^>]+href/);
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('says who it was prepared for, when somebody says', () => {
    const html = manualHtml(manualFor(PRODUCT_MANUAL, ['orders']), { firm: 'Decor Bucket' });
    expect(html).toMatch(/Prepared for Decor Bucket/);
  });

  it('escapes what it prints, so a field name cannot become markup', () => {
    const html = manualHtml({
      generatedAt: '2026-01-01',
      modules: [
        {
          key: 'x',
          label: '<script>alert(1)</script>',
          audience: 'workspace',
          summary: 'a & b',
          flow: [],
          sold: true,
          screens: [],
          actions: [],
          permissions: [],
        },
      ],
    });
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toMatch(/&lt;script&gt;/);
    expect(html).toMatch(/a &amp; b/);
  });

  it('marks a field nobody has written up, rather than leaving a blank cell', () => {
    // A blank reads as "nothing to say"; it means "nobody has said it".
    const html = manualHtml(manualFor(PRODUCT_MANUAL, sold));
    expect(html).toMatch(/Not yet written up/);
  });

  it('gives every module it prints a heading and a description', () => {
    const cut = manualFor(PRODUCT_MANUAL, sold);
    for (const module of cut.modules) {
      expect(module.summary.trim()).not.toBe('');
      expect(manualHtml(cut)).toContain(module.label);
    }
  });
});

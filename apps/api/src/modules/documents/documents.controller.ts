import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { DocumentsService } from './documents.service';
import {
  renderChallanHtml,
  renderCreditNoteHtml,
  renderInvoiceHtml,
} from './invoice-document';
import { renderStatementHtml } from './statement-document';
import { statementLines } from './statement';
import {
  CancelDto,
  ChallanDto,
  CreditNoteDto,
  DocumentQueryDto,
  RaiseInvoiceDto,
} from './dto/document.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The paper the shop gives people.
 *
 * Behind the finance module rather than a module of its own: an invoice is
 * money paper, and a shop that has bought the money module has bought the
 * document that claims the money. Selling the bill separately from the receipt
 * would be selling half of one thing.
 *
 * Three prefixes off one controller, like payments, because a document is
 * reached both from the order it belongs to and from the list of all of them,
 * and splitting the two would put the same rules in two places.
 */
@RequireModule(MODULES.FINANCE)
@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  // -- invoices -------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('invoices')
  invoices(@Query() query: DocumentQueryDto) {
    return this.documents.invoices(query);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('invoices/:id')
  invoice(@Param('id') id: string) {
    return this.documents.invoice(id);
  }

  /** The invoice for one order, or nothing when it has not been raised. */
  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('orders/:orderId/invoice')
  forOrder(@Param('orderId') orderId: string) {
    return this.documents.forOrder(orderId);
  }

  /**
   * What one order was charged, credited and paid.
   *
   * Three figures, never folded into one. Credited money is not received
   * money, and an order must never be able to look paid by rupees nobody
   * collected.
   */
  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('orders/:orderId/receivable')
  receivable(@Param('orderId') orderId: string) {
    return this.documents.receivableFor(orderId);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_ISSUE)
  @Post('orders/:orderId/invoice')
  raise(
    @Param('orderId') orderId: string,
    @Body() dto: RaiseInvoiceDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.documents.raise(orderId, dto, user?.id);
  }

  /**
   * Voids one, keeping its number.
   *
   * Gated apart from raising, because raising a bill is the sales desk's job
   * and voiding one is the question the accountant answers for.
   */
  @RequirePermissions(PERMISSIONS.INVOICE_CANCEL)
  @Post('invoices/:id/cancel')
  cancelInvoice(@Param('id') id: string, @Body() dto: CancelDto) {
    return this.documents.cancelInvoice(id, dto);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('invoices/:id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async invoiceDocument(@Param('id') id: string) {
    const [invoice, firm] = await Promise.all([
      this.documents.invoice(id),
      this.firm(),
    ]);

    return renderInvoiceHtml({
      invoice: invoice as unknown as Record<string, unknown>,
      firm,
      // The shop's standing terms stand in when the invoice carried none, so a
      // bill raised in a hurry still goes out saying what was agreed.
      terms: (firm as { termsAndConditions?: string | null }).termsAndConditions ?? null,
      letterheadUrl: await this.dataUri(
        (firm as { letterheadFileId?: string | null }).letterheadFileId,
      ),
    });
  }

  // -- challans -------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('challans')
  challans(@Query() query: DocumentQueryDto) {
    return this.documents.challans(query);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('challans/:id')
  challan(@Param('id') id: string) {
    return this.documents.challan(id);
  }

  /**
   * More than one is allowed, unlike an invoice: a job often leaves in two
   * vans on two days, and each load needs its own paper travelling with it.
   */
  @RequirePermissions(PERMISSIONS.INVOICE_ISSUE)
  @Post('orders/:orderId/challan')
  issueChallan(
    @Param('orderId') orderId: string,
    @Body() dto: ChallanDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.documents.issueChallan(orderId, dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_CANCEL)
  @Post('challans/:id/cancel')
  cancelChallan(@Param('id') id: string, @Body() dto: CancelDto) {
    return this.documents.cancelChallan(id, dto);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('challans/:id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async challanDocument(@Param('id') id: string) {
    const [challan, firm] = await Promise.all([
      this.documents.challan(id),
      this.firm(),
    ]);

    return renderChallanHtml({
      challan: challan as unknown as Record<string, unknown>,
      firm,
      letterheadUrl: await this.dataUri(
        (firm as { letterheadFileId?: string | null }).letterheadFileId,
      ),
    });
  }

  // -- credit notes ---------------------------------------------------------

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('credit-notes')
  creditNotes(@Query() query: DocumentQueryDto) {
    return this.documents.creditNotes(query);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('credit-notes/:id')
  creditNote(@Param('id') id: string) {
    return this.documents.creditNote(id);
  }

  /**
   * Credits part or all of an invoice.
   *
   * Its own permission, and the tightest of them. This is the one route in the
   * product that reduces what somebody owes without a rupee moving, which is
   * exactly the shape of a thing a shop wants very few people able to do.
   */
  @RequirePermissions(PERMISSIONS.CREDIT_NOTE_ISSUE)
  @Post('invoices/:id/credit-notes')
  credit(
    @Param('id') id: string,
    @Body() dto: CreditNoteDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.documents.credit(id, dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_CANCEL)
  @Post('credit-notes/:id/cancel')
  cancelCreditNote(@Param('id') id: string, @Body() dto: CancelDto) {
    return this.documents.cancelCreditNote(id, dto);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('credit-notes/:id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async creditNoteDocument(@Param('id') id: string) {
    const [note, firm] = await Promise.all([
      this.documents.creditNote(id),
      this.firm(),
    ]);

    return renderCreditNoteHtml({
      note: note as unknown as Record<string, unknown>,
      firm,
      letterheadUrl: await this.dataUri(
        (firm as { letterheadFileId?: string | null }).letterheadFileId,
      ),
    });
  }

  // -- the shop's own particulars -------------------------------------------

  /** The firm block every document is printed under. */
  private async firm(): Promise<Record<string, unknown>> {
    const row = await this.prisma.firmProfile.findFirst();
    return (row ?? { name: '' }) as unknown as Record<string, unknown>;
  }

  /**
   * A stored file as a data URI, or nothing when there is none.
   *
   * Inlined rather than linked: the app renders these inside a PDF converter
   * that will not fetch anything, and a letterhead that silently fails to load
   * is an invoice nobody can send.
   */
  private async dataUri(fileId?: string | null): Promise<string | null> {
    if (!fileId) return null;
    try {
      const { file, data } = await this.files.read(fileId);
      return `data:${file.mimeType};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  }
  /**
   * A client's statement, as paper.
   *
   * Served as HTML for the same reason every other document here is: this
   * product has no PDF engine, and the browser's own print-to-PDF renders the
   * A4 sheet these are laid out for. An invoice, a challan and a statement all
   * reach a client the same way.
   */
  @RequirePermissions(PERMISSIONS.INVOICE_VIEW)
  @Get('clients/:id/statement')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async clientStatement(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const [client, firm] = await Promise.all([
      this.prisma.client.findFirst({
        where: { id },
        select: { name: true, gstin: true, billingAddress: true, address: true },
      }),
      this.prisma.firmProfile.findFirst(),
    ]);
    if (!client) throw new NotFoundException('That client does not exist');

    const lines = await statementLines(
      this.prisma as never,
      id,
      from ? new Date(from) : null,
      to ? new Date(to) : null,
    );

    return renderStatementHtml({
      client: {
        name: client.name,
        gstin: client.gstin,
        address: client.billingAddress ?? client.address,
      },
      firm: (firm ?? {}) as Record<string, unknown>,
      letterheadUrl: await this.dataUri(firm?.letterheadFileId ?? null),
      period: { from: from ?? null, to: to ?? null },
      lines,
    });
  }

}

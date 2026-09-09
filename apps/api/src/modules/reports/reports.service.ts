import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportFormat, ReportStatus, StorageBackend } from '@prisma/client';
import {
  ReportKind,
  reportDefinition,
  reportFileName,
  reportRequestError,
} from '@decor/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { StorageService } from '../../common/storage/storage.service';
import { BUILDERS, NOT_YET_BUILT, builderFor } from './report-builders';
import { writeWorkbook } from './report-workbook';

/**
 * Asking for a report, and what happens to it afterwards.
 *
 * A GST quarter is not something to hold an HTTP connection open for, so a
 * request writes a QUEUED row and answers immediately; the worker picks it up.
 * That also means the two things can be scaled apart — see `role.ts`.
 *
 * The row outlives the file. Retention drops the bytes and leaves the row, so
 * "who exported the payout ledger, and when" survives the disk space.
 */

/** How long a built file is kept before retention takes the bytes. */
const KEEP_FOR_DAYS = 14;

/** A report that has been GENERATING longer than this was abandoned. */
const STALE_AFTER_MINUTES = 30;

const SELECT = {
  id: true,
  kind: true,
  format: true,
  status: true,
  fromDate: true,
  toDate: true,
  params: true,
  rowCount: true,
  error: true,
  expiresAt: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  fileId: true,
  requestedBy: { select: { id: true, name: true } },
} satisfies Prisma.ReportSelect;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Queue a report.
   *
   * Everything that can be refused is refused here, before a row exists: a
   * request that cannot succeed should fail in front of the person who made
   * it, not an hour later inside a worker nobody is watching.
   */
  async request(
    input: {
      kind: string;
      format?: ReportFormat;
      from?: string | null;
      to?: string | null;
      clientId?: string | null;
    },
    userId?: string,
  ) {
    const complaint = reportRequestError(input);
    if (complaint) throw new BadRequestException(complaint);

    // Catalogued but not written yet. Said plainly rather than queued into an
    // empty file.
    const pending = NOT_YET_BUILT[input.kind as ReportKind];
    if (pending) {
      throw new BadRequestException(
        `${reportDefinition(input.kind)?.label ?? input.kind} is ${pending}.`,
      );
    }
    if (!builderFor(input.kind)) {
      throw new BadRequestException(`There is no report called "${input.kind}".`);
    }

    const definition = reportDefinition(input.kind)!;
    const format = input.format ?? (definition.formats[0] as ReportFormat);

    return this.prisma.report.create({
      data: {
        tenantId: tenantId(),
        kind: input.kind,
        format,
        status: ReportStatus.QUEUED,
        fromDate: input.from ? new Date(input.from) : null,
        toDate: input.to ? new Date(input.to) : null,
        params: input.clientId ? { clientId: input.clientId } : Prisma.JsonNull,
        requestedById: userId ?? null,
      },
      select: SELECT,
    });
  }

  list(query: { kind?: string; status?: ReportStatus; take?: number }) {
    return this.prisma.report.findMany({
      where: {
        kind: query.kind || undefined,
        status: query.status || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 50, 200),
      select: SELECT,
    });
  }

  async one(id: string) {
    const report = await this.prisma.report.findFirst({ where: { id }, select: SELECT });
    if (!report) throw new NotFoundException('That report does not exist');
    return report;
  }

  /**
   * The file, if it is still here.
   *
   * A READY report whose bytes have been taken by retention is not an error to
   * apologise for — it is expected, and the answer says so in words somebody
   * can act on rather than a bare 404.
   */
  async download(id: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const report = await this.prisma.report.findFirst({
      where: { id },
      select: { ...SELECT, file: true },
    });
    if (!report) throw new NotFoundException('That report does not exist');

    if (report.status !== ReportStatus.READY || !report.file) {
      throw new NotFoundException(
        report.status === ReportStatus.EXPIRED
          ? 'That report has been cleared. Ask for it again.'
          : `That report is ${report.status.toLowerCase()}, so there is nothing to download yet.`,
      );
    }

    const data = await this.storage.read(report.file);

    return {
      fileName: reportFileName(
        report.kind as ReportKind,
        report.format,
        { from: isoDay(report.fromDate), to: isoDay(report.toDate) },
      ),
      mimeType:
        report.format === ReportFormat.XLSX
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      data,
    };
  }

  /**
   * Build one queued report.
   *
   * Claims the row first, and only builds if the claim took. Two workers
   * reaching for the same report would otherwise both build it and the second
   * would overwrite the first's file — wasteful rather than wrong, but the
   * lease is one `updateMany` and there is no reason not to.
   */
  async generateOne(id: string): Promise<boolean> {
    const claimed = await this.prisma.report.updateMany({
      where: { id, status: ReportStatus.QUEUED },
      data: { status: ReportStatus.GENERATING, startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) return false;

    const report = await this.prisma.report.findFirst({ where: { id } });
    if (!report) return false;

    try {
      const build = builderFor(report.kind);
      if (!build) throw new Error(`There is no builder for ${report.kind}`);

      const firm = await this.prisma.firmProfile.findFirst({ select: { name: true } });

      const built = await build({
        prisma: this.prisma as never,
        from: report.fromDate,
        to: report.toDate,
        params: (report.params as Record<string, unknown>) ?? {},
        firmName: firm?.name,
      });

      const bytes = await writeWorkbook({
        title: reportDefinition(report.kind)?.label ?? report.kind,
        firmName: firm?.name,
        period: { from: isoDay(report.fromDate), to: isoDay(report.toDate) },
        sheets: built.sheets,
      });

      const fileName = reportFileName(report.kind as ReportKind, report.format, {
        from: isoDay(report.fromDate),
        to: isoDay(report.toDate),
      });

      const stored = await this.storage.put(bytes, {
        fileName,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        keyPrefix: 'reports',
        backend: StorageBackend.S3,
      });

      const file = await this.prisma.storedFile.create({
        data: {
          tenantId: tenantId(),
          backend: stored.backend,
          bucket: stored.bucket,
          objectKey: stored.objectKey,
          data: stored.data ? new Uint8Array(stored.data) : undefined,
          fileName,
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          byteSize: stored.byteSize,
          checksum: stored.checksum,
          isEncrypted: stored.isEncrypted,
          encryptionKeyId: stored.encryptionKeyId,
        },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + KEEP_FOR_DAYS);

      await this.prisma.report.update({
        where: { id },
        data: {
          status: ReportStatus.READY,
          fileId: file.id,
          rowCount: built.rowCount,
          finishedAt: new Date(),
          expiresAt,
        },
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${report.kind} failed — ${message}`);

      await this.prisma.report.update({
        where: { id },
        data: {
          status: ReportStatus.FAILED,
          // Kept on the row, so the person who asked is told why rather than
          // watching it sit at "Building" forever.
          error: message.slice(0, 500),
          finishedAt: new Date(),
        },
      });
      return false;
    }
  }

  /** Everything queued, oldest first. Used by the worker. */
  async pending(limit = 5): Promise<string[]> {
    const rows = await this.prisma.report.findMany({
      where: { status: ReportStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Put back anything a worker claimed and then died holding.
   *
   * Without this a report abandoned mid-build sits at GENERATING forever, and
   * the person who asked for it waits for something nobody is doing.
   */
  async requeueAbandoned(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000);
    const { count } = await this.prisma.report.updateMany({
      where: { status: ReportStatus.GENERATING, startedAt: { lt: cutoff } },
      data: { status: ReportStatus.QUEUED, startedAt: null },
    });
    return count;
  }

  /**
   * Drop the bytes of anything past its date, and keep the row.
   *
   * The file is a convenience; the record that it was produced is not.
   */
  async expire(): Promise<{ expired: number; filesRemoved: number }> {
    const due = await this.prisma.report.findMany({
      where: {
        status: ReportStatus.READY,
        expiresAt: { lt: new Date() },
      },
      select: { id: true, fileId: true, file: true },
    });

    let filesRemoved = 0;
    for (const report of due) {
      if (report.file) {
        await this.storage.delete(report.file).catch(() => undefined);
        await this.prisma.storedFile.delete({ where: { id: report.file.id } }).catch(() => undefined);
        filesRemoved += 1;
      }
      await this.prisma.report.update({
        where: { id: report.id },
        data: { status: ReportStatus.EXPIRED, fileId: null },
      });
    }

    return { expired: due.length, filesRemoved };
  }
}

function isoDay(value: Date | null): string | null {
  if (!value) return null;
  // The column is a DATE, so it comes back at UTC midnight; reading the UTC
  // parts is what gives back the day that was stored rather than the one
  // before it.
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export { BUILDERS };

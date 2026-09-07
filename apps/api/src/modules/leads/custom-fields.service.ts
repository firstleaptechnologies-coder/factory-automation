import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomFieldDefinition, CustomFieldEntity, CustomFieldType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomFieldDto, UpdateCustomFieldDto } from './dto/lead.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

/**
 * Admin-defined fields.
 *
 * The forms build themselves from these rows, so the shop can start capturing
 * "architect" or "budget band" on a lead without a schema change. Values live
 * in a JSON column on the record; validation happens here, on write, because a
 * JSON column will otherwise accept anything at all.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list(entity: CustomFieldEntity, includeInactive = false) {
    return this.prisma.customFieldDefinition.findMany({
      where: { entity, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  create(dto: CustomFieldDto) {
    if (
      (dto.type === CustomFieldType.SELECT || dto.type === CustomFieldType.MULTI_SELECT) &&
      !dto.options?.length
    ) {
      throw new BadRequestException('A select field needs at least one option');
    }
    return this.prisma.customFieldDefinition.create({
      data: {
        tenantId: tenantId(),
        entity: dto.entity,
        key: slugify(dto.key),
        label: dto.label,
        type: dto.type ?? CustomFieldType.TEXT,
        options: dto.options ?? [],
        helpText: dto.helpText,
        required: dto.required ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateCustomFieldDto) {
    const field = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!field) throw new NotFoundException(`Field ${id} not found`);
    return this.prisma.customFieldDefinition.update({ where: { id }, data: dto });
  }

  /**
   * Deactivate rather than delete: records already carry values under this key,
   * and dropping the definition would leave them unlabelled.
   */
  async deactivate(id: string) {
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Validate and normalise submitted values against the current definitions. */
  async coerce(
    entity: CustomFieldEntity,
    values: Record<string, unknown> | undefined,
    { partial = false }: { partial?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const definitions = await this.list(entity);
    const input = values ?? {};
    const output: Record<string, unknown> = {};

    for (const definition of definitions) {
      const raw = input[definition.key];

      if (raw === undefined || raw === null || raw === '') {
        if (definition.required && !partial) {
          throw new BadRequestException(`${definition.label} is required`);
        }
        continue;
      }
      output[definition.key] = this.coerceOne(definition, raw);
    }

    // Keys with no definition are dropped rather than stored, so a renamed or
    // removed field cannot leave orphan data behind.
    return output;
  }

  private coerceOne(definition: CustomFieldDefinition, raw: unknown): unknown {
    switch (definition.type) {
      case CustomFieldType.NUMBER: {
        const value = Number(raw);
        if (Number.isNaN(value)) {
          throw new BadRequestException(`${definition.label} must be a number`);
        }
        return value;
      }
      case CustomFieldType.BOOLEAN:
        return raw === true || raw === 'true';
      case CustomFieldType.DATE: {
        const date = new Date(String(raw));
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException(`${definition.label} must be a date`);
        }
        return date.toISOString();
      }
      case CustomFieldType.SELECT: {
        const value = String(raw);
        if (!definition.options.includes(value)) {
          throw new BadRequestException(
            `${definition.label} must be one of: ${definition.options.join(', ')}`,
          );
        }
        return value;
      }
      case CustomFieldType.MULTI_SELECT: {
        const list = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        const invalid = list.filter((v) => !definition.options.includes(v));
        if (invalid.length) {
          throw new BadRequestException(
            `${definition.label} has invalid values: ${invalid.join(', ')}`,
          );
        }
        return list;
      }
      default:
        return String(raw);
    }
  }
}

/** Field keys address JSON properties, so keep them boring. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

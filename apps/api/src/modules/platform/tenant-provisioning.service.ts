import { Injectable, Logger } from '@nestjs/common';
import {
  CustomFieldType,
  ExpenseOptionField,
  LedgerAccount,
  LetterKind,
  PrismaClient,
  StatusCategory,
  UserRole,
  WorkflowKind,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES } from '@decor/shared';

const FT = 304.8;

/**
 * What a brand new workspace starts with.
 *
 * A tenant that opens to an empty database cannot punch a single order — there
 * would be no materials to pick and no statuses to sit in. So provisioning
 * seeds a working shop that the tenant's admin then edits: their own roles,
 * their own materials, their own flow. Nothing here is shared between tenants;
 * every row is a copy.
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  async seed(
    db: PrismaClient,
    tenantId: string,
    owner: { name: string; code: string; password: string; email?: string },
  ): Promise<void> {
    await this.seedRoles(db, tenantId);
    await this.seedGstSlabs(db, tenantId);
    await this.seedDisbursementCategories(db, tenantId);
    await this.seedExpenseOptions(db, tenantId);
    await this.seedLetterTemplates(db, tenantId);
    await this.seedMaterials(db, tenantId);
    await this.seedSizes(db, tenantId);
    await this.seedOrderWorkflow(db, tenantId);
    await this.seedLeadPipeline(db, tenantId);
    await this.seedOwner(db, tenantId, owner);
    this.logger.log(`Seeded workspace ${tenantId}`);
  }

  /**
   * Bring a workspace's stock roles up to date with this release.
   *
   * A tenant is seeded once, so a permission added in a later release would
   * otherwise never reach a workspace that already exists — its owner would be
   * locked out of the new screen with no way to grant themselves access. Only
   * `isSystem` roles are touched; anything the tenant built themselves is
   * theirs to maintain.
   */
  async syncSystemRoles(db: PrismaClient, tenantId: string): Promise<number> {
    let changed = 0;
    for (const role of DEFAULT_ROLES) {
      const existing = await db.role.findFirst({
        where: { tenantId, code: role.code, isSystem: true },
      });
      if (!existing) continue;

      const missing = role.permissions.filter(
        (permission) => !existing.permissions.includes(permission),
      );
      if (!missing.length) continue;

      await db.role.update({
        where: { id: existing.id },
        data: { permissions: [...existing.permissions, ...missing] },
      });
      this.logger.log(`${role.code} in ${tenantId} gained ${missing.join(', ')}`);
      changed += missing.length;
    }
    return changed;
  }

  private async seedRoles(db: PrismaClient, tenantId: string) {
    for (const role of DEFAULT_ROLES) {
      await db.role.create({
        data: {
          tenantId,
          code: role.code,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: true,
        },
      });
    }
  }

  /** Indian GST slabs. A tenant can add, rename or deactivate any of them. */
  private async seedGstSlabs(db: PrismaClient, tenantId: string) {
    const slabs = [
      { name: 'Nil (0%)', ratePct: 0, sortOrder: 0 },
      { name: '5%', ratePct: 5, sortOrder: 1 },
      { name: '12%', ratePct: 12, sortOrder: 2 },
      { name: '18%', ratePct: 18, sortOrder: 3, isDefault: true },
      { name: '28%', ratePct: 28, sortOrder: 4 },
    ];
    for (const slab of slabs) {
      await db.gstSlab.create({ data: { tenantId, ...slab } });
    }
  }

  /**
   * Buckets for money paid out of an order after the client has paid — a
   * fitter, a transporter, a polisher. Every tenant renames the ledger itself
   * (the `disbursementLabel` setting, "ISC" by default) and edits these.
   */
  private async seedDisbursementCategories(db: PrismaClient, tenantId: string) {
    const categories = [
      { code: 'INSTALL', name: 'Installation', sortOrder: 0 },
      { code: 'TRANSPORT', name: 'Transport', sortOrder: 1 },
      { code: 'LABOUR', name: 'Site labour', sortOrder: 2 },
      { code: 'MISC', name: 'Miscellaneous', sortOrder: 3 },
    ];
    for (const category of categories) {
      await db.disbursementCategory.create({ data: { tenantId, ...category } });
    }
    await db.appSetting.create({
      data: { tenantId, key: 'disbursementLabel', value: 'ISC' },
    });
  }

  /**
   * A first set of expense dropdowns, meant to be edited.
   *
   * Every one of these is a guess about a shop we have not met: the point of
   * the model is that they change them. What matters here is that a new
   * workspace can record an expense on day one instead of staring at five
   * empty lists — and that the ways of paying arrive knowing which of them
   * comes out of the drawer, because that is what keeps cash in hand honest.
   */
  private async seedExpenseOptions(db: PrismaClient, tenantId: string) {
    const options: {
      field: ExpenseOptionField;
      label: string;
      account?: LedgerAccount;
    }[] = [
      { field: ExpenseOptionField.PAYMENT_TYPE, label: 'Cash', account: LedgerAccount.CASH },
      { field: ExpenseOptionField.PAYMENT_TYPE, label: 'UPI', account: LedgerAccount.BANK },
      { field: ExpenseOptionField.PAYMENT_TYPE, label: 'Bank transfer', account: LedgerAccount.BANK },
      { field: ExpenseOptionField.PAYMENT_TYPE, label: 'Cheque', account: LedgerAccount.BANK },
      { field: ExpenseOptionField.PAYMENT_TYPE, label: 'Card', account: LedgerAccount.BANK },

      { field: ExpenseOptionField.SPENT_TYPE, label: 'Raw material' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Tooling' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Machine maintenance' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Electricity' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Rent' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Transport' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Labour' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Consumables' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Office' },
      { field: ExpenseOptionField.SPENT_TYPE, label: 'Miscellaneous' },

      { field: ExpenseOptionField.VENDOR, label: 'Shop' },
      { field: ExpenseOptionField.TO_NAME, label: 'Shop' },
    ];

    for (const [index, option] of options.entries()) {
      await db.expenseOption.create({
        data: {
          tenantId,
          field: option.field,
          label: option.label,
          account: option.account ?? null,
          sortOrder: index * 10,
        },
      });
    }
  }

  /**
   * A first set of letters, meant to be rewritten.
   *
   * Every one of these is a guess about a shop we have not met, and the words
   * are the shop's to change — that is what the template screen is for. What
   * matters is that a new workspace can hand somebody an offer letter in its
   * first week instead of retyping one from a phone, and that the placeholders
   * are already in the right places so the shape survives the rewrite.
   */
  private async seedLetterTemplates(db: PrismaClient, tenantId: string) {
    const templates: { kind: LetterKind; name: string; body: string }[] = [
      {
        kind: LetterKind.OFFER,
        name: 'Offer',
        body: [
          'Dear {{name}},',
          'We are pleased to offer you the position of {{designation}} at {{firmName}}.',
          'Your salary will be {{salary}}. You are expected to join on {{joinedOn}}.',
          'Please sign and return a copy of this letter to confirm that you accept.',
          'Yours sincerely,',
        ].join('\n\n'),
      },
      {
        kind: LetterKind.APPOINTMENT,
        name: 'Appointment',
        body: [
          'Dear {{name}},',
          'Further to your acceptance of our offer, this letter confirms your appointment as {{designation}} in the {{department}} department at {{firmName}}, with effect from {{joinedOn}}.',
          'Your employee number is {{code}} and your salary is {{salary}}.',
          'You are expected to keep the working hours of the shop, to look after the tools and materials in your care, and to treat what you learn here as confidential.',
          'Yours sincerely,',
        ].join('\n\n'),
      },
      {
        kind: LetterKind.NDA,
        name: 'Confidentiality undertaking',
        body: [
          'I, {{name}} ({{code}}), working as {{designation}} at {{firmName}}, undertake the following.',
          'I will not disclose to anybody outside this firm the designs, drawings, programmes, rates, client names or methods of work that I come to know here, either during my employment or after it ends.',
          'I will not take copies of any design or programme file out of the premises without written permission.',
          'I understand that this undertaking continues to apply after I leave.',
          'Signed on {{today}}.',
        ].join('\n\n'),
      },
      {
        kind: LetterKind.RESPONSIBILITY,
        name: 'Responsibilities',
        body: [
          'Dear {{name}},',
          'This letter sets out what your work as {{designation}} involves, so that there is no doubt about it on either side.',
          'You are responsible for the machines and tools assigned to you, for the material you are issued, and for the quality of what you produce. You are to report any damage or breakdown the same day.',
          'Please sign below to confirm that you have read and understood this.',
          'For {{firmName}}',
        ].join('\n\n'),
      },
      {
        kind: LetterKind.EXPERIENCE,
        name: 'Experience',
        body: [
          'To whomsoever it may concern',
          'This is to certify that {{name}} ({{code}}) worked at {{firmName}} as {{designation}} from {{joinedOn}} to {{leftOn}}.',
          'During this period we found the conduct and the work satisfactory.',
          'We wish them well.',
          'For {{firmName}}',
        ].join('\n\n'),
      },
      {
        kind: LetterKind.RELIEVING,
        name: 'Relieving',
        body: [
          'Dear {{name}},',
          'This is to confirm that you have been relieved from your duties as {{designation}} at {{firmName}} with effect from the close of {{leftOn}}.',
          'All dues have been settled and no company property remains with you.',
          'For {{firmName}}',
        ].join('\n\n'),
      },
    ];

    for (const template of templates) {
      await db.letterTemplate.create({ data: { tenantId, ...template } });
    }
  }

  private async seedMaterials(db: PrismaClient, tenantId: string) {
    const materials = [
      { code: 'MDF', name: 'MDF', color: '#B98B54', thicknesses: [6, 9, 12, 18, 25] },
      { code: 'PLY', name: 'Plywood', color: '#C4A484', thicknesses: [6, 12, 18, 19] },
      { code: 'ACRYLIC', name: 'Acrylic', color: '#7FD1E8', thicknesses: [3, 5, 8, 10] },
      { code: 'MARBLE', name: 'Marble', color: '#D8D8D8', thicknesses: [16, 18, 20] },
      { code: 'GRANITE', name: 'Granite', color: '#6E6E6E', thicknesses: [16, 18, 20, 30] },
      { code: 'SS', name: 'Stainless Steel', color: '#A8B2BD', thicknesses: [0.8, 1, 1.2, 1.5, 2] },
      { code: 'BRASS', name: 'Brass', color: '#C9A227', thicknesses: [0.8, 1, 1.5] },
      { code: 'WPC', name: 'WPC', color: '#8FA98F', thicknesses: [8, 12, 18] },
    ];

    for (const [index, material] of materials.entries()) {
      const saved = await db.material.create({
        data: {
          tenantId,
          code: material.code,
          name: material.name,
          color: material.color,
          sortOrder: index,
        },
      });
      for (const [order, valueMm] of material.thicknesses.entries()) {
        await db.materialThickness.create({
          data: { tenantId, materialId: saved.id, valueMm, sortOrder: order },
        });
      }
    }
  }

  private async seedSizes(db: PrismaClient, tenantId: string) {
    const presets = [
      { code: 'SHEET-8X4', name: '8 × 4 ft sheet', l: 8, w: 4 },
      { code: 'SHEET-7X4', name: '7 × 4 ft sheet', l: 7, w: 4 },
      { code: 'SHEET-6X4', name: '6 × 4 ft sheet', l: 6, w: 4 },
      { code: 'SLAB-9X5', name: '9 × 5 ft slab', l: 9, w: 5 },
      { code: 'DOOR-7X3', name: '7 × 3 ft door', l: 7, w: 3 },
    ];
    for (const [index, preset] of presets.entries()) {
      await db.sizePreset.create({
        data: {
          tenantId,
          code: preset.code,
          name: preset.name,
          lengthMm: preset.l * FT,
          widthMm: preset.w * FT,
          sortOrder: index,
        },
      });
    }
  }

  private async seedOrderWorkflow(db: PrismaClient, tenantId: string) {
    const stages = [
      { code: 'LEAD', name: 'Lead', color: '#8B949E', category: StatusCategory.OPEN, isInitial: true, isEntryPoint: true, x: 40, y: 200 },
      /*
       * `home` puts a stage on the home screen's summary, in that order. A new
       * shop starts watching the five stages work actually sits in; the screen
       * behind Admin → Status flow → Main card changes them.
       */
      { code: 'ORDER_FINAL', name: 'Order confirmed', color: '#FF6B1A', category: StatusCategory.OPEN, isEntryPoint: true, x: 260, y: 200, home: 0 },
      { code: 'DESIGN', name: 'Design', color: '#8957E5', category: StatusCategory.IN_PROGRESS, x: 480, y: 200, home: 1 },
      { code: 'DESIGN_APPROVAL', name: 'Design approval', color: '#B392F0', category: StatusCategory.IN_PROGRESS, x: 700, y: 200, home: 2 },
      { code: 'PRODUCTION', name: 'Production', color: '#D29922', category: StatusCategory.IN_PROGRESS, x: 920, y: 200, home: 3 },
      { code: 'QC_SANDING', name: 'QC & Sanding', color: '#E3B341', category: StatusCategory.IN_PROGRESS, x: 1140, y: 200, home: 4 },
      { code: 'PAYMENT', name: 'Payment', color: '#58A6FF', category: StatusCategory.IN_PROGRESS, x: 1360, y: 200 },
      { code: 'READY_DISPATCH', name: 'Ready to dispatch', color: '#3FB950', category: StatusCategory.IN_PROGRESS, x: 1580, y: 200 },
      { code: 'DELIVERED', name: 'Delivered', color: '#2EA043', category: StatusCategory.DONE, isTerminal: true, x: 1800, y: 200 },
      { code: 'ON_HOLD', name: 'On hold', color: '#D29922', category: StatusCategory.OPEN, x: 700, y: 60 },
      { code: 'CANCELLED', name: 'Cancelled', color: '#DA3633', category: StatusCategory.CANCELLED, isTerminal: true, x: 1360, y: 60 },
    ];
    const moves: [string, string, { label?: string; requiresNote?: boolean }?][] = [
      ['LEAD', 'ORDER_FINAL', { label: 'Confirm' }],
      ['LEAD', 'CANCELLED', { requiresNote: true }],
      ['ORDER_FINAL', 'DESIGN'],
      ['DESIGN', 'DESIGN_APPROVAL', { label: 'Send to client' }],
      ['DESIGN_APPROVAL', 'DESIGN', { label: 'Changes requested', requiresNote: true }],
      ['DESIGN_APPROVAL', 'PRODUCTION', { label: 'Approved' }],
      ['PRODUCTION', 'QC_SANDING'],
      ['QC_SANDING', 'PRODUCTION', { label: 'Rework', requiresNote: true }],
      ['QC_SANDING', 'PAYMENT'],
      ['PAYMENT', 'READY_DISPATCH'],
      ['READY_DISPATCH', 'DELIVERED'],
      ['ORDER_FINAL', 'ON_HOLD', { requiresNote: true }],
      ['DESIGN', 'ON_HOLD', { requiresNote: true }],
      ['PRODUCTION', 'ON_HOLD', { requiresNote: true }],
      ['ON_HOLD', 'ORDER_FINAL'],
      ['ON_HOLD', 'PRODUCTION'],
      ['ON_HOLD', 'CANCELLED', { requiresNote: true }],
      ['ORDER_FINAL', 'CANCELLED', { requiresNote: true }],
    ];

    await this.buildWorkflow(db, tenantId, {
      code: 'DEFAULT',
      name: 'Order journey',
      description: 'Lead to delivery. Edit the stages and arrows to match how you work.',
      kind: WorkflowKind.ORDER,
      stages,
      moves,
    });
  }

  private async seedLeadPipeline(db: PrismaClient, tenantId: string) {
    const stages = [
      { code: 'NEW_ENQUIRY', name: 'New enquiry', color: '#8B949E', category: StatusCategory.OPEN, isInitial: true, isEntryPoint: true, x: 40, y: 160 },
      { code: 'CONTACTED', name: 'Contacted', color: '#58A6FF', category: StatusCategory.IN_PROGRESS, x: 260, y: 160 },
      { code: 'SITE_VISIT', name: 'Site visit', color: '#8957E5', category: StatusCategory.IN_PROGRESS, x: 480, y: 160 },
      { code: 'QUOTED', name: 'Quoted', color: '#D29922', category: StatusCategory.IN_PROGRESS, x: 700, y: 160 },
      { code: 'WON', name: 'Won', color: '#2EA043', category: StatusCategory.DONE, isTerminal: true, x: 920, y: 160 },
      { code: 'LOST', name: 'Lost', color: '#DA3633', category: StatusCategory.CANCELLED, isTerminal: true, x: 700, y: 40 },
    ];
    const moves: [string, string, { requiresNote?: boolean }?][] = [
      ['NEW_ENQUIRY', 'CONTACTED'],
      ['NEW_ENQUIRY', 'LOST', { requiresNote: true }],
      ['CONTACTED', 'SITE_VISIT'],
      ['CONTACTED', 'QUOTED'],
      ['CONTACTED', 'LOST', { requiresNote: true }],
      ['SITE_VISIT', 'QUOTED'],
      ['SITE_VISIT', 'LOST', { requiresNote: true }],
      ['QUOTED', 'WON'],
      ['QUOTED', 'LOST', { requiresNote: true }],
    ];

    await this.buildWorkflow(db, tenantId, {
      code: 'LEAD_PIPELINE',
      name: 'Lead pipeline',
      description: 'Enquiry to won.',
      kind: WorkflowKind.LEAD,
      stages,
      moves,
      quoteStage: 'QUOTED',
      lostStage: 'LOST',
    });

    const sources = [
      { code: 'WALK_IN', name: 'Walk-in', color: '#8B949E' },
      { code: 'REFERRAL', name: 'Referral', color: '#2EA043' },
      { code: 'ARCHITECT', name: 'Architect', color: '#8957E5' },
      { code: 'WHATSAPP', name: 'WhatsApp', color: '#25D366' },
      { code: 'PHONE', name: 'Phone enquiry', color: '#58A6FF' },
      { code: 'REPEAT', name: 'Repeat client', color: '#D29922' },
    ];
    for (const [index, source] of sources.entries()) {
      await db.leadSource.create({ data: { tenantId, ...source, sortOrder: index } });
    }

    const fields = [
      { key: 'site_area_sqft', label: 'Site area (sq ft)', type: CustomFieldType.NUMBER },
      { key: 'architect', label: 'Architect / designer', type: CustomFieldType.TEXT },
      {
        key: 'budget_band',
        label: 'Budget band',
        type: CustomFieldType.SELECT,
        options: ['Under 1L', '1-5L', '5-10L', '10L+'],
      },
    ];
    for (const [index, field] of fields.entries()) {
      await db.customFieldDefinition.create({
        data: {
          tenantId,
          entity: 'LEAD',
          key: field.key,
          label: field.label,
          type: field.type,
          options: field.options ?? [],
          sortOrder: index,
        },
      });
    }
  }

  private async buildWorkflow(
    db: PrismaClient,
    tenantId: string,
    spec: {
      code: string;
      name: string;
      description: string;
      kind: WorkflowKind;
      stages: Record<string, never>[] | any[];
      moves: [string, string, { label?: string; requiresNote?: boolean }?][];
      /** Stage codes the flow itself points at, once the stages exist. */
      quoteStage?: string;
      lostStage?: string;
    },
  ) {
    const workflow = await db.workflow.create({
      data: {
        tenantId,
        code: spec.code,
        name: spec.name,
        description: spec.description,
        kind: spec.kind,
        isDefault: true,
      },
    });

    const ids = new Map<string, string>();
    for (const [index, stage] of spec.stages.entries()) {
      const saved = await db.workflowStatus.create({
        data: {
          tenantId,
          workflowId: workflow.id,
          code: stage.code,
          name: stage.name,
          color: stage.color,
          category: stage.category,
          isInitial: stage.isInitial ?? false,
          isEntryPoint: stage.isEntryPoint ?? false,
          isTerminal: stage.isTerminal ?? false,
          sortOrder: index,
          canvasX: stage.x,
          canvasY: stage.y,
          homeCardOrder: stage.home ?? null,
        },
      });
      ids.set(stage.code, saved.id);
    }

    /*
     * The two stages the pipeline itself names.
     *
     * Set here rather than left empty because a shop that never opens the flow
     * screen should still have a quote move the enquiry and a refusal close it
     * — and they can change or clear either afterwards.
     */
    if (spec.quoteStage || spec.lostStage) {
      await db.workflow.update({
        where: { id: workflow.id },
        data: {
          ...(spec.quoteStage ? { quoteStatusId: ids.get(spec.quoteStage) } : {}),
          ...(spec.lostStage ? { lostStatusId: ids.get(spec.lostStage) } : {}),
        },
      });
    }

    for (const [from, to, options] of spec.moves) {
      await db.workflowTransition.create({
        data: {
          tenantId,
          workflowId: workflow.id,
          fromStatusId: ids.get(from)!,
          toStatusId: ids.get(to)!,
          label: options?.label,
          requiresNote: options?.requiresNote ?? false,
        },
      });
    }
  }

  private async seedOwner(
    db: PrismaClient,
    tenantId: string,
    owner: { name: string; code: string; password: string; email?: string },
  ) {
    const ownerRole = await db.role.findFirst({ where: { tenantId, code: 'OWNER' } });
    await db.user.create({
      data: {
        tenantId,
        code: owner.code.toUpperCase(),
        name: owner.name,
        email: owner.email?.toLowerCase(),
        passwordHash: await bcrypt.hash(owner.password, 10),
        role: UserRole.ADMIN,
        roleId: ownerRole?.id,
      },
    });
  }
}

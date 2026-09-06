/**
 * Baseline configuration for a fresh install.
 *
 * Everything here is admin-editable afterwards — this only exists so the punch
 * screen has something to work with on day one. Idempotent: safe to re-run.
 */
import {
  CustomFieldEntity,
  CustomFieldType,
  PrismaClient,
  StatusCategory,
  UserRole,
  WorkflowKind,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Admin types feet; storage is millimetres. 1 ft = 304.8 mm exactly. */
const FT = 304.8;
const IN = 25.4;

const MATERIALS = [
  {
    code: 'MDF',
    name: 'MDF',
    color: '#B98B54',
    thicknessesMm: [6, 9, 12, 18, 25],
  },
  {
    code: 'PLY',
    name: 'Plywood',
    color: '#C4A484',
    thicknessesMm: [6, 12, 18, 19],
  },
  {
    code: 'ACRYLIC',
    name: 'Acrylic',
    color: '#7FD1E8',
    thicknessesMm: [3, 5, 8, 10],
  },
  {
    code: 'MARBLE',
    name: 'Marble',
    color: '#D8D8D8',
    thicknessesMm: [16, 18, 20],
  },
  {
    code: 'GRANITE',
    name: 'Granite',
    color: '#6E6E6E',
    thicknessesMm: [16, 18, 20, 30],
  },
  {
    code: 'SS',
    name: 'Stainless Steel',
    color: '#A8B2BD',
    thicknessesMm: [0.8, 1, 1.2, 1.5, 2],
  },
  {
    code: 'BRASS',
    name: 'Brass',
    color: '#C9A227',
    thicknessesMm: [0.8, 1, 1.5],
  },
  {
    code: 'WPC',
    name: 'WPC',
    color: '#8FA98F',
    thicknessesMm: [8, 12, 18],
  },
];

/** Common sheet sizes, entered the way the shop says them. */
const SIZE_PRESETS = [
  { code: 'SHEET-8X4', name: '8 × 4 ft sheet', lengthFt: 8, widthFt: 4 },
  { code: 'SHEET-7X4', name: '7 × 4 ft sheet', lengthFt: 7, widthFt: 4 },
  { code: 'SHEET-6X4', name: '6 × 4 ft sheet', lengthFt: 6, widthFt: 4 },
  { code: 'SLAB-9X5', name: '9 × 5 ft slab', lengthFt: 9, widthFt: 5 },
  { code: 'DOOR-7X3', name: '7 × 3 ft door', lengthFt: 7, widthFt: 3 },
];

/**
 * A starting flow. Statuses are grouped so the hierarchy feature has something
 * real in it: the three production steps sit under "In Production".
 */
const STATUSES = [
  { code: 'NEW', name: 'New', color: '#6B7785', category: StatusCategory.OPEN, isInitial: true, x: 40, y: 200 },
  { code: 'CONFIRMED', name: 'Confirmed', color: '#2F81F7', category: StatusCategory.OPEN, x: 260, y: 200 },
  { code: 'PRODUCTION', name: 'In Production', color: '#D29922', category: StatusCategory.IN_PROGRESS, x: 480, y: 200 },
  { code: 'CUTTING', name: 'Cutting', color: '#D29922', category: StatusCategory.IN_PROGRESS, parent: 'PRODUCTION', x: 480, y: 320 },
  { code: 'FINISHING', name: 'Finishing', color: '#D29922', category: StatusCategory.IN_PROGRESS, parent: 'PRODUCTION', x: 480, y: 400 },
  { code: 'QC', name: 'Quality Check', color: '#8957E5', category: StatusCategory.IN_PROGRESS, parent: 'PRODUCTION', x: 480, y: 480 },
  { code: 'READY', name: 'Ready', color: '#2EA043', category: StatusCategory.IN_PROGRESS, x: 700, y: 200 },
  { code: 'DELIVERED', name: 'Delivered', color: '#2EA043', category: StatusCategory.DONE, isTerminal: true, x: 920, y: 200 },
  { code: 'ON_HOLD', name: 'On Hold', color: '#D29922', category: StatusCategory.OPEN, x: 260, y: 60 },
  { code: 'CANCELLED', name: 'Cancelled', color: '#DA3633', category: StatusCategory.CANCELLED, isTerminal: true, x: 700, y: 60 },
];

const TRANSITIONS: [string, string, { label?: string; requiresNote?: boolean }?][] = [
  ['NEW', 'CONFIRMED'],
  ['NEW', 'CANCELLED', { requiresNote: true }],
  ['CONFIRMED', 'PRODUCTION'],
  ['CONFIRMED', 'ON_HOLD', { requiresNote: true }],
  ['ON_HOLD', 'CONFIRMED'],
  ['ON_HOLD', 'CANCELLED', { requiresNote: true }],
  ['PRODUCTION', 'CUTTING'],
  ['CUTTING', 'FINISHING'],
  ['FINISHING', 'QC'],
  ['QC', 'READY'],
  ['QC', 'CUTTING', { label: 'Rework', requiresNote: true }],
  ['PRODUCTION', 'READY'],
  ['READY', 'DELIVERED'],
  ['PRODUCTION', 'ON_HOLD', { requiresNote: true }],
];


/** A starting lead pipeline. Every stage and arrow is editable on the canvas. */
const LEAD_STAGES = [
  { code: 'NEW_ENQUIRY', name: 'New enquiry', color: '#6B7785', category: StatusCategory.OPEN, isInitial: true, x: 40, y: 160 },
  { code: 'CONTACTED', name: 'Contacted', color: '#2F81F7', category: StatusCategory.IN_PROGRESS, x: 260, y: 160 },
  { code: 'SITE_VISIT', name: 'Site visit', color: '#8957E5', category: StatusCategory.IN_PROGRESS, x: 480, y: 160 },
  { code: 'QUOTED', name: 'Quoted', color: '#D29922', category: StatusCategory.IN_PROGRESS, x: 700, y: 160 },
  { code: 'WON', name: 'Won', color: '#2EA043', category: StatusCategory.DONE, isTerminal: true, x: 920, y: 160 },
  { code: 'LOST', name: 'Lost', color: '#DA3633', category: StatusCategory.CANCELLED, isTerminal: true, x: 700, y: 40 },
];

const LEAD_TRANSITIONS: [string, string, { requiresNote?: boolean }?][] = [
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

const LEAD_SOURCES = [
  { code: 'WALK_IN', name: 'Walk-in', color: '#6B7785' },
  { code: 'REFERRAL', name: 'Referral', color: '#2EA043' },
  { code: 'ARCHITECT', name: 'Architect', color: '#8957E5' },
  { code: 'WHATSAPP', name: 'WhatsApp', color: '#25D366' },
  { code: 'PHONE', name: 'Phone enquiry', color: '#2F81F7' },
  { code: 'REPEAT', name: 'Repeat client', color: '#D29922' },
];

/** Examples only — the admin adds, renames and removes these freely. */
const LEAD_FIELDS = [
  { key: 'site_area_sqft', label: 'Site area (sq ft)', type: CustomFieldType.NUMBER, sortOrder: 0 },
  { key: 'architect', label: 'Architect / designer', type: CustomFieldType.TEXT, sortOrder: 1 },
  {
    key: 'budget_band',
    label: 'Budget band',
    type: CustomFieldType.SELECT,
    options: ['Under 1L', '1-5L', '5-10L', '10L+'],
    sortOrder: 2,
  },
  { key: 'site_ready', label: 'Site ready for measurement', type: CustomFieldType.BOOLEAN, sortOrder: 3 },
];

async function seedLeads() {
  for (const [index, source] of LEAD_SOURCES.entries()) {
    await prisma.leadSource.upsert({
      where: { code: source.code },
      update: { name: source.name, color: source.color, sortOrder: index },
      create: { ...source, sortOrder: index },
    });
  }

  for (const field of LEAD_FIELDS) {
    await prisma.customFieldDefinition.upsert({
      where: { entity_key: { entity: CustomFieldEntity.LEAD, key: field.key } },
      update: { label: field.label, type: field.type, options: field.options ?? [] },
      create: {
        entity: CustomFieldEntity.LEAD,
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options ?? [],
        sortOrder: field.sortOrder,
      },
    });
  }

  const pipeline = await prisma.workflow.upsert({
    where: { code: 'LEAD_PIPELINE' },
    update: {},
    create: {
      code: 'LEAD_PIPELINE',
      name: 'Lead pipeline',
      description: 'Enquiry to won. Edit the stages and arrows on the flow builder.',
      kind: WorkflowKind.LEAD,
      isDefault: true,
    },
  });

  const stageIds = new Map<string, string>();
  for (const [index, stage] of LEAD_STAGES.entries()) {
    const saved = await prisma.workflowStatus.upsert({
      where: { workflowId_code: { workflowId: pipeline.id, code: stage.code } },
      update: {
        name: stage.name,
        color: stage.color,
        category: stage.category,
        isInitial: stage.isInitial ?? false,
        isTerminal: stage.isTerminal ?? false,
        sortOrder: index,
        canvasX: stage.x,
        canvasY: stage.y,
      },
      create: {
        workflowId: pipeline.id,
        code: stage.code,
        name: stage.name,
        color: stage.color,
        category: stage.category,
        isInitial: stage.isInitial ?? false,
        isTerminal: stage.isTerminal ?? false,
        sortOrder: index,
        canvasX: stage.x,
        canvasY: stage.y,
      },
    });
    stageIds.set(stage.code, saved.id);
  }

  for (const [from, to, options] of LEAD_TRANSITIONS) {
    await prisma.workflowTransition.upsert({
      where: {
        workflowId_fromStatusId_toStatusId: {
          workflowId: pipeline.id,
          fromStatusId: stageIds.get(from)!,
          toStatusId: stageIds.get(to)!,
        },
      },
      update: { requiresNote: options?.requiresNote ?? false },
      create: {
        workflowId: pipeline.id,
        fromStatusId: stageIds.get(from)!,
        toStatusId: stageIds.get(to)!,
        requiresNote: options?.requiresNote ?? false,
      },
    });
  }
}

async function main() {
  for (const [index, material] of MATERIALS.entries()) {
    const saved = await prisma.material.upsert({
      where: { code: material.code },
      update: { name: material.name, color: material.color, sortOrder: index },
      create: {
        code: material.code,
        name: material.name,
        color: material.color,
        sortOrder: index,
      },
    });

    for (const [order, valueMm] of material.thicknessesMm.entries()) {
      await prisma.materialThickness.upsert({
        where: { materialId_valueMm: { materialId: saved.id, valueMm } },
        update: { sortOrder: order },
        create: { materialId: saved.id, valueMm, sortOrder: order },
      });
    }
  }

  for (const [index, preset] of SIZE_PRESETS.entries()) {
    await prisma.sizePreset.upsert({
      where: { code: preset.code },
      update: { name: preset.name, sortOrder: index },
      create: {
        code: preset.code,
        name: preset.name,
        lengthMm: preset.lengthFt * FT,
        widthMm: preset.widthFt * FT,
        sortOrder: index,
      },
    });
  }

  const workflow = await prisma.workflow.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: {
      code: 'DEFAULT',
      name: 'Standard order flow',
      description: 'Edit the statuses and arrows on the flow builder to match how the shop works.',
      isDefault: true,
    },
  });

  const statusIds = new Map<string, string>();
  for (const [index, status] of STATUSES.entries()) {
    const saved = await prisma.workflowStatus.upsert({
      where: { workflowId_code: { workflowId: workflow.id, code: status.code } },
      update: {
        name: status.name,
        color: status.color,
        category: status.category,
        isInitial: status.isInitial ?? false,
        isTerminal: status.isTerminal ?? false,
        sortOrder: index,
        canvasX: status.x,
        canvasY: status.y,
      },
      create: {
        workflowId: workflow.id,
        code: status.code,
        name: status.name,
        color: status.color,
        category: status.category,
        isInitial: status.isInitial ?? false,
        isTerminal: status.isTerminal ?? false,
        sortOrder: index,
        canvasX: status.x,
        canvasY: status.y,
      },
    });
    statusIds.set(status.code, saved.id);
  }

  // Parents are set in a second pass so a child can reference a later status.
  for (const status of STATUSES) {
    if (!status.parent) continue;
    await prisma.workflowStatus.update({
      where: { id: statusIds.get(status.code)! },
      data: { parentId: statusIds.get(status.parent)! },
    });
  }

  for (const [from, to, options] of TRANSITIONS) {
    await prisma.workflowTransition.upsert({
      where: {
        workflowId_fromStatusId_toStatusId: {
          workflowId: workflow.id,
          fromStatusId: statusIds.get(from)!,
          toStatusId: statusIds.get(to)!,
        },
      },
      update: { label: options?.label, requiresNote: options?.requiresNote ?? false },
      create: {
        workflowId: workflow.id,
        fromStatusId: statusIds.get(from)!,
        toStatusId: statusIds.get(to)!,
        label: options?.label,
        requiresNote: options?.requiresNote ?? false,
      },
    });
  }

  const users = [
    { code: 'ADMIN', name: 'Administrator', role: UserRole.ADMIN, password: 'admin123' },
    { code: 'SALES01', name: 'Sales Desk', role: UserRole.SALES, password: 'sales123' },
    { code: 'PROD01', name: 'Production', role: UserRole.PRODUCTION, password: 'prod123' },
  ];
  for (const { password, ...user } of users) {
    await prisma.user.upsert({
      where: { code: user.code },
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash: await bcrypt.hash(password, 10) },
    });
  }

  await seedLeads();

  await prisma.appSetting.upsert({
    where: { key: 'defaultDisplayUnit' },
    update: {},
    create: { key: 'defaultDisplayUnit', value: 'FT' },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    materials: await prisma.material.count(),
    thicknesses: await prisma.materialThickness.count(),
    sizePresets: await prisma.sizePreset.count(),
    statuses: await prisma.workflowStatus.count(),
    transitions: await prisma.workflowTransition.count(),
    users: await prisma.user.count(),
    leadStages: await prisma.workflowStatus.count({
      where: { workflow: { kind: WorkflowKind.LEAD } },
    }),
    leadSources: await prisma.leadSource.count(),
    leadFields: await prisma.customFieldDefinition.count(),
  });
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

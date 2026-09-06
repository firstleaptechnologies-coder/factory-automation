/**
 * Baseline data for a fresh install: the five material families the unit works
 * in, the four CNC machines, stock locations, and the reason codes the shop
 * floor picks from. Idempotent — safe to re-run after a schema change.
 */
import {
  LocationType,
  MachineType,
  MaterialCategory,
  PrismaClient,
  Uom,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CATEGORIES = [
  { code: 'WOOD', name: 'Wood', description: 'MDF, plywood, solid wood, veneer' },
  { code: 'STONE', name: 'Stone', description: 'Marble, granite, quartz, Corian' },
  { code: 'ACRYLIC', name: 'Acrylic', description: 'Cast and extruded acrylic sheet' },
  { code: 'METAL', name: 'Metal', description: 'MS, SS, brass, aluminium sheet' },
  { code: 'WPC', name: 'WPC', description: 'Wood-plastic composite board' },
];

const MATERIALS = [
  {
    code: 'MDF-18',
    name: 'MDF 18mm',
    category: 'WOOD',
    uom: Uom.SHEET,
    thicknessMm: 18,
    lengthMm: 2440,
    widthMm: 1220,
    densityKgM3: 750,
    standardCost: 2100,
    defaultKerfMm: 6,
    wastageAllowancePct: 8,
  },
  {
    code: 'PLY-12',
    name: 'Marine Plywood 12mm',
    category: 'WOOD',
    uom: Uom.SHEET,
    thicknessMm: 12,
    lengthMm: 2440,
    widthMm: 1220,
    densityKgM3: 680,
    standardCost: 2600,
    defaultKerfMm: 6,
  },
  {
    code: 'VEN-OAK',
    name: 'Oak Veneer Ply 4mm',
    category: 'WOOD',
    uom: Uom.SHEET,
    thicknessMm: 4,
    lengthMm: 2440,
    widthMm: 1220,
    standardCost: 3400,
    hasGrain: true,
    defaultKerfMm: 4,
  },
  {
    code: 'MRB-STAT',
    name: 'Statuario Marble Slab 18mm',
    category: 'STONE',
    uom: Uom.SLAB,
    thicknessMm: 18,
    lengthMm: 2700,
    widthMm: 1600,
    densityKgM3: 2700,
    standardCost: 34000,
    hasGrain: true,
    defaultKerfMm: 4,
    wastageAllowancePct: 15,
  },
  {
    code: 'ACR-CLR-5',
    name: 'Clear Acrylic 5mm',
    category: 'ACRYLIC',
    uom: Uom.SHEET,
    thicknessMm: 5,
    lengthMm: 2440,
    widthMm: 1220,
    densityKgM3: 1190,
    standardCost: 4200,
    defaultKerfMm: 3,
  },
  {
    code: 'SS-304-1.2',
    name: 'SS 304 Sheet 1.2mm',
    category: 'METAL',
    uom: Uom.SHEET,
    thicknessMm: 1.2,
    lengthMm: 2440,
    widthMm: 1220,
    densityKgM3: 8000,
    standardCost: 7800,
    defaultKerfMm: 1,
    wastageAllowancePct: 5,
  },
  {
    code: 'BRASS-1',
    name: 'Brass Sheet 1mm',
    category: 'METAL',
    uom: Uom.SHEET,
    thicknessMm: 1,
    lengthMm: 2440,
    widthMm: 1220,
    densityKgM3: 8500,
    standardCost: 21000,
    defaultKerfMm: 1,
  },
  {
    code: 'WPC-18',
    name: 'WPC Board 18mm',
    category: 'WPC',
    uom: Uom.SHEET,
    thicknessMm: 18,
    lengthMm: 2440,
    widthMm: 1220,
    densityKgM3: 700,
    standardCost: 2900,
    defaultKerfMm: 6,
  },
];

const MACHINES = [
  {
    code: 'CNC-01',
    name: 'CNC Router 1',
    type: MachineType.CNC_ROUTER,
    bedLengthMm: 3000,
    bedWidthMm: 1500,
    maxZMm: 200,
    spindlePowerKw: 6,
    hourlyRate: 900,
    categories: ['WOOD', 'WPC', 'ACRYLIC'],
  },
  {
    code: 'CNC-02',
    name: 'CNC Router 2',
    type: MachineType.CNC_ROUTER,
    bedLengthMm: 2500,
    bedWidthMm: 1300,
    maxZMm: 150,
    spindlePowerKw: 4.5,
    hourlyRate: 750,
    categories: ['WOOD', 'WPC'],
  },
  {
    code: 'CNC-03',
    name: 'Stone CNC',
    type: MachineType.CNC_ROUTER,
    bedLengthMm: 3200,
    bedWidthMm: 2000,
    maxZMm: 300,
    spindlePowerKw: 11,
    hourlyRate: 1800,
    categories: ['STONE'],
  },
  {
    code: 'CNC-04',
    name: 'Laser Cutter',
    type: MachineType.CNC_LASER,
    bedLengthMm: 1300,
    bedWidthMm: 900,
    maxZMm: 50,
    spindlePowerKw: 0,
    hourlyRate: 650,
    categories: ['ACRYLIC', 'WOOD', 'METAL'],
  },
];

const LOCATIONS = [
  { code: 'RACK-A', name: 'Sheet Rack A', type: LocationType.RACK },
  { code: 'RACK-B', name: 'Sheet Rack B', type: LocationType.RACK },
  { code: 'STONE-YARD', name: 'Stone Slab Yard', type: LocationType.FLOOR },
  { code: 'OFFCUT', name: 'Offcut Store', type: LocationType.OFFCUT_STORE },
  { code: 'WIP', name: 'Work in Progress', type: LocationType.WIP },
  { code: 'FG', name: 'Finished Goods', type: LocationType.FINISHED_GOODS },
  { code: 'SCRAP', name: 'Scrap Yard', type: LocationType.SCRAP_YARD },
];

const DOWNTIME_REASONS = [
  { code: 'TOOL-CHANGE', name: 'Tool change', isPlanned: true },
  { code: 'SETUP', name: 'Job setup', isPlanned: true },
  { code: 'MAINT', name: 'Scheduled maintenance', isPlanned: true },
  { code: 'BREAKDOWN', name: 'Machine breakdown', isPlanned: false },
  { code: 'NO-MATERIAL', name: 'Material not available', isPlanned: false },
  { code: 'NO-OPERATOR', name: 'Operator unavailable', isPlanned: false },
  { code: 'POWER', name: 'Power failure', isPlanned: false },
  { code: 'PROGRAM', name: 'Waiting for program / design', isPlanned: false },
];

const REJECTION_REASONS = [
  { code: 'CHIP', name: 'Chipping / tear-out', category: 'machine' },
  { code: 'DIM', name: 'Dimensional error', category: 'machine' },
  { code: 'BURN', name: 'Burn marks', category: 'machine' },
  { code: 'CRACK', name: 'Material crack', category: 'material' },
  { code: 'WARP', name: 'Warped sheet', category: 'material' },
  { code: 'WRONG-PROG', name: 'Wrong program run', category: 'operator' },
  { code: 'DESIGN', name: 'Design error', category: 'design' },
];

async function main() {
  const categories = new Map<string, MaterialCategory>();
  for (const category of CATEGORIES) {
    const saved = await prisma.materialCategory.upsert({
      where: { code: category.code },
      update: { name: category.name, description: category.description },
      create: category,
    });
    categories.set(category.code, saved);
  }

  for (const { category, ...material } of MATERIALS) {
    await prisma.material.upsert({
      where: { code: material.code },
      update: material,
      create: { ...material, categoryId: categories.get(category)!.id },
    });
  }

  for (const { categories: cats, ...machine } of MACHINES) {
    const saved = await prisma.machine.upsert({
      where: { code: machine.code },
      update: machine,
      create: machine,
    });
    for (const code of cats) {
      await prisma.machineMaterial.upsert({
        where: {
          machineId_categoryId: {
            machineId: saved.id,
            categoryId: categories.get(code)!.id,
          },
        },
        update: {},
        create: {
          machineId: saved.id,
          categoryId: categories.get(code)!.id,
          setupMinutes: 15,
        },
      });
    }
  }

  for (const location of LOCATIONS) {
    await prisma.stockLocation.upsert({
      where: { code: location.code },
      update: location,
      create: location,
    });
  }

  for (const reason of DOWNTIME_REASONS) {
    await prisma.downtimeReason.upsert({
      where: { code: reason.code },
      update: reason,
      create: reason,
    });
  }

  for (const reason of REJECTION_REASONS) {
    await prisma.rejectionReason.upsert({
      where: { code: reason.code },
      update: reason,
      create: reason,
    });
  }

  // Starter logins. Change these passwords before the system leaves the office.
  const users = [
    { code: 'ADMIN', name: 'Administrator', role: UserRole.ADMIN, password: 'admin123' },
    { code: 'PLAN01', name: 'Production Planner', role: UserRole.PLANNER, password: 'plan123' },
    { code: 'OP01', name: 'Operator 1', role: UserRole.OPERATOR, password: 'op123' },
    { code: 'OP02', name: 'Operator 2', role: UserRole.OPERATOR, password: 'op123' },
    { code: 'STORE01', name: 'Store Keeper', role: UserRole.STORE, password: 'store123' },
  ];

  for (const { password, ...user } of users) {
    await prisma.user.upsert({
      where: { code: user.code },
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash: await bcrypt.hash(password, 10) },
    });
  }

  const counts = {
    categories: await prisma.materialCategory.count(),
    materials: await prisma.material.count(),
    machines: await prisma.machine.count(),
    locations: await prisma.stockLocation.count(),
    users: await prisma.user.count(),
  };
  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

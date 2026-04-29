import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4)
});

export const portSchema = z.object({
  code: z.string().min(2).max(10).transform(s => s.toUpperCase()),
  name: z.string().min(2),
  province: z.string().optional().nullable(),
  country: z.string().default("ES")
});

export const boatSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2),
  active: z.boolean().default(true)
});

export const supplierSchema = z.object({
  taxId: z.string().optional().nullable(),
  name: z.string().min(2),
  address: z.string().optional().nullable(),
  active: z.boolean().default(true)
});

export const speciesSchema = z.object({
  code: z.string().min(1).max(10).transform(s => s.toUpperCase()),
  commonName: z.string().min(2),
  scientificName: z.string().optional().nullable(),
  active: z.boolean().default(true)
});

export const equivalenceSchema = z.object({
  rawName: z.string().min(1).transform(s => s.toUpperCase().replace(/\s+/g, " ").trim()),
  scope: z.enum(["GLOBAL", "PORT"]).default("GLOBAL"),
  portId: z.string().optional().nullable(),
  speciesId: z.string().min(1),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true)
}).refine(d => d.scope === "GLOBAL" || !!d.portId, { message: "scope=PORT requiere portId" });

export const documentFormatSchema = z.object({
  code: z.string().min(2).transform(s => s.toUpperCase()),
  name: z.string().min(2),
  portId: z.string().optional().nullable(),
  parserKey: z.string().min(2),
  description: z.string().optional().nullable(),
  active: z.boolean().default(true),
  config: z.record(z.any()).default({})
});

export const invoiceLineSchema = z.object({
  id: z.string().optional(),
  lineNo: z.number().int().positive(),
  lineDate: z.string().nullable().optional(),          // ISO
  rawSpeciesName: z.string().min(1),
  speciesId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  kilos: z.number().nonnegative(),
  pricePerKg: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  vatRate: z.number().min(0).max(100).default(0),
  vatAmount: z.number().nonnegative().default(0),
  notes: z.string().nullable().optional()
});

export const invoiceUpdateSchema = z.object({
  invoiceNumber: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  portId: z.string().nullable().optional(),
  boatId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  currency: z.string().default("EUR"),
  kind: z.enum(["CAPTURA", "OTHER"]).default("CAPTURA"),
  subtotal: z.number().nonnegative(),
  taxes: z.number().nonnegative(),
  fees: z.number().nonnegative(),
  other: z.number().nonnegative(),
  total: z.number().nonnegative(),
  notes: z.string().nullable().optional(),
  lines: z.array(invoiceLineSchema),
  verify: z.boolean().default(false)
});

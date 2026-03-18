import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export const invoiceSchema = z.object({
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1, "Fecha requerida"),
  portId: z.string().optional().transform(v => v || undefined),
  supplierId: z.string().optional().transform(v => v || undefined),
  boatId: z.string().optional().transform(v => v || undefined),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0).default(0),
  feesAmount: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  totalAmount: z.number().min(0),
  observations: z.string().optional(),
  lines: z
    .array(
      z.object({
        speciesId: z.string().optional(),
        speciesName: z.string().optional(),
        kilos: z.number().positive("Kilos debe ser positivo"),
        pricePerKilo: z.number().positive("Precio debe ser positivo"),
        lineAmount: z.number().min(0),
        boxCount: z.number().int().optional(),
        quality: z.string().optional(),
        observations: z.string().optional(),
      })
    )
    .min(1, "Al menos una línea de captura"),
});

export const expenseSchema = z.object({
  expenseTypeId: z.string().min(1, "Tipo de gasto requerido"),
  periodId: z.string().optional().transform(v => v || undefined),
  boatId: z.string().optional().transform(v => v || undefined),
  crewMemberId: z.string().optional().transform(v => v || undefined),
  amount: z.number().positive("Importe debe ser positivo"),
  target: z.enum(["ARMADOR", "TRIPULACION", "AMBOS", "BARCO"]),
  description: z.string().optional(),
  date: z.string().min(1, "Fecha requerida"),
  receiptRef: z.string().optional(),
});

export const crewMemberSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  lastName: z.string().min(1, "Apellidos requeridos"),
  taxId: z.string().optional(),
  socialSecId: z.string().optional(),
  categoryId: z.string().min(1, "Categoría requerida"),
  boatId: z.string().optional(),
  irpfPercent: z.number().min(0).max(100).default(0),
  bankAccount: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  joinDate: z.string().optional(),
  notes: z.string().optional(),
});

export const boatSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  registration: z.string().min(1, "Matrícula requerida"),
  flag: z.string().optional(),
  boatType: z.string().optional(),
  tonGt: z.number().optional(),
  notes: z.string().optional(),
});

export const portSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  code: z.string().optional(),
  province: z.string().optional(),
  country: z.string().default("España"),
});

export const supplierSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  taxId: z.string().optional(),
  portId: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export const speciesSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  scientificName: z.string().optional(),
  code: z.string().optional(),
  category: z.string().optional(),
});

export const payrollRunSchema = z.object({
  periodId: z.string().min(1, "Período requerido"),
  boatId: z.string().min(1, "Barco requerido"),
  allocationRuleId: z.string().optional(),
  notes: z.string().optional(),
});

export const allocationRuleSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  boatId: z.string().optional(),
  ownerPercent: z.number().min(0).max(100),
  crewPercent: z.number().min(0).max(100),
  method: z.enum(["PORCENTAJE_FIJO", "PARTES_IGUALES", "CATEGORIA", "PERSONALIZADO"]),
  deductExpensesFrom: z.string().default("MONTE_MAYOR"),
  notes: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export const periodSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  startDate: z.string().min(1, "Fecha inicio requerida"),
  endDate: z.string().min(1, "Fecha fin requerida"),
  boatId: z.string().optional(),
  notes: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type CrewMemberInput = z.infer<typeof crewMemberSchema>;
export type BoatInput = z.infer<typeof boatSchema>;
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;

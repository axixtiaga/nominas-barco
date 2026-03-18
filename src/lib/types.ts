// Shared enums — mirrors prisma/schema.prisma
// Defined here so they are available before `prisma generate` runs
// and in client components that cannot import server-only modules.

export enum UserRole {
  ADMIN   = "ADMIN",
  OFICINA = "OFICINA",
  LECTURA = "LECTURA",
}

export enum DocumentStatus {
  PENDIENTE = "PENDIENTE",
  PROCESADO = "PROCESADO",
  REVISADO  = "REVISADO",
  ERROR     = "ERROR",
}

export enum PayrollStatus {
  BORRADOR = "BORRADOR",
  VALIDADA = "VALIDADA",
  CERRADA  = "CERRADA",
  PAGADA   = "PAGADA",
}

export enum ExpenseTarget {
  ARMADOR    = "ARMADOR",
  TRIPULACION = "TRIPULACION",
  AMBOS      = "AMBOS",
  BARCO      = "BARCO",
}

export enum AllocationMethod {
  PORCENTAJE_FIJO = "PORCENTAJE_FIJO",
  PARTES_IGUALES  = "PARTES_IGUALES",
  CATEGORIA       = "CATEGORIA",
  PERSONALIZADO   = "PERSONALIZADO",
}

export enum PeriodStatus {
  ABIERTO  = "ABIERTO",
  CERRADO  = "CERRADO",
  BLOQUEADO = "BLOQUEADO",
}

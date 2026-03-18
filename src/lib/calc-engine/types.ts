export interface CalcInput {
  periodId: string;
  boatId: string;
  // Totales de capturas en el período
  totalCapturas: number;
  // Gastos por tipo
  expenses: {
    id: string;
    amount: number;
    target: string; // ARMADOR | TRIPULACION | AMBOS | BARCO
    description: string;
    expenseTypeCode: string;
  }[];
  // Tripulantes con sus partes
  crewMembers: {
    id: string;
    name: string;
    lastName: string;
    baseParts: number; // partes del reparto (de la categoría)
    irpfPercent: number;
    categoryCode: string;
  }[];
  // Regla de reparto activa
  allocationRule: {
    ownerPercent: number; // % para el armador
    crewPercent: number;  // % para la tripulación
    method: string;
    deductExpensesFrom: string; // MONTE_MAYOR | BRUTO_PESCADOR
  };
  // Parámetros SS
  ssParams: {
    employeePercent: number; // e.g. 0.064
    employerPercent: number; // e.g. 0.236
    baseType: string;        // TOTAL_CAPTURAS | BRUTO
  };
}

export interface CrewCalcResult {
  crewMemberId: string;
  name: string;
  baseParts: number;
  sharePercent: number; // % que le corresponde del total tripulación
  brutoPescador: number;
  ssEmployee: number;
  ssEmployer: number;
  irpfPercent: number;
  irpfAmount: number;
  otherDeductions: number;
  netoPescador: number;
  detail: Record<string, unknown>;
}

export interface CalcResult {
  // Ingresos
  totalCapturas: number;
  // Gastos totales y por tipo
  totalGastos: number;
  gastosPorTarget: {
    armador: number;
    tripulacion: number;
    ambos: number;
    barco: number;
  };
  // Monte mayor = total capturas - gastos que afectan a ambos o al monte
  monteMayor: number;
  baseRepartible: number;
  // Reparto
  ownerShare: number;
  crewShare: number;
  ownerPercent: number;
  crewPercent: number;
  // Totales SS
  totalSsEmployee: number;
  totalSsEmployer: number;
  // Totales
  totalBruto: number;
  totalIRPF: number;
  totalNeto: number;
  // Detalle por marinero
  crewResults: CrewCalcResult[];
  // Trazabilidad
  rulesApplied: Record<string, unknown>;
  warnings: string[];
}

import { prisma } from "../prisma";

export const documentsRepo = {
  list: (params: { status?: string; kind?: string; take?: number; skip?: number } = {}) => {
    const where: any = {};
    if (params.status) where.status = params.status as any;
    if (params.kind) where.kind = params.kind as any;
    return prisma.document.findMany({
      where,
      include: {
        format: true,
        invoice: {
          include: {
            port: true, boat: true, supplier: true,
            // Solo las fechas de cada línea — para mostrar la "Fecha de descarga"
            // (día real de la captura) en la lista. Ligero: 1 dato por línea.
            lines: { select: { lineDate: true } }
          }
        },
        expense: {
          include: {
            supplier: true, port: true,
            lines: { select: { lineDate: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      // Subimos el tope a 500 — antes era 50 y se cortaba al importar lotes
      // grandes de PDFs (ocultando los más antiguos). Con 500 cubrimos varios
      // meses sobradamente; cuando crezca, añadiremos paginación de verdad.
      take: params.take ?? 500,
      skip: params.skip ?? 0
    });
  },
  get: (id: string) =>
    prisma.document.findUnique({
      where: { id },
      include: {
        format: { include: { port: true } },
        invoice: { include: { lines: { orderBy: { lineNo: "asc" } }, port: true, boat: true, supplier: true } },
        expense: {
          include: {
            supplier: true,
            port: true,
            invoice: true,
            lines: { orderBy: { lineNo: "asc" }, include: { linkedInvoice: { select: { id: true, invoiceNumber: true, issueDate: true, port: { select: { name: true } } } } } }
          }
        }
      }
    }),
  findBySha: (sha: string) => prisma.document.findUnique({ where: { sha256: sha } })
};

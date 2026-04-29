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
        invoice: { include: { port: true, boat: true, supplier: true } },
        expense: { include: { supplier: true, port: true } }
      },
      orderBy: { createdAt: "desc" },
      take: params.take ?? 50,
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

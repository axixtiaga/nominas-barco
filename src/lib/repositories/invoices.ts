import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

export type InvoiceFilter = {
  from?: Date; to?: Date;
  portId?: string; boatId?: string; supplierId?: string;
  speciesId?: string; rawSpecies?: string;
  status?: string;
};

export const invoicesRepo = {
  list: (f: InvoiceFilter = {}) => {
    const where: Prisma.InvoiceWhereInput = {};
    if (f.from || f.to) where.issueDate = { gte: f.from, lte: f.to };
    if (f.portId) where.portId = f.portId;
    if (f.boatId) where.boatId = f.boatId;
    if (f.supplierId) where.supplierId = f.supplierId;
    if (f.status) where.status = f.status as any;
    if (f.speciesId || f.rawSpecies) {
      where.lines = {
        some: {
          ...(f.speciesId ? { speciesId: f.speciesId } : {}),
          ...(f.rawSpecies ? { rawSpeciesName: { contains: f.rawSpecies, mode: "insensitive" } } : {})
        }
      };
    }
    return prisma.invoice.findMany({
      where,
      include: { port: true, boat: true, supplier: true, lines: { include: { species: true } }, document: true },
      orderBy: { issueDate: "desc" }
    });
  },
  get: (id: string) =>
    prisma.invoice.findUnique({
      where: { id },
      include: { port: true, boat: true, supplier: true, lines: { include: { species: true }, orderBy: { lineNo: "asc" } }, document: true }
    })
};

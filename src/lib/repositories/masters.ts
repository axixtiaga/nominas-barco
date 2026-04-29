import { prisma } from "../prisma";

export const mastersRepo = {
  ports: {
    list: () => prisma.port.findMany({ orderBy: { name: "asc" } }),
    create: (data: any) => prisma.port.create({ data }),
  },
  boats: {
    list: () => prisma.boat.findMany({ orderBy: { name: "asc" } }),
    create: (data: any) => prisma.boat.create({ data }),
  },
  suppliers: {
    list: () => prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    create: (data: any) => prisma.supplier.create({ data }),
    findOrCreateByName: async (name: string, taxId?: string | null) => {
      const n = name.trim();
      if (!n) return null;

      // Buscar por CIF primero (más específico), luego por nombre.
      if (taxId) {
        const byTax = await prisma.supplier.findUnique({ where: { taxId } });
        if (byTax) return byTax;
      }
      const byName = await prisma.supplier.findFirst({ where: { name: n } });
      if (byName) {
        if (taxId && !byName.taxId) {
          return prisma.supplier.update({ where: { id: byName.id }, data: { taxId } });
        }
        return byName;
      }

      // Crear con protección contra condición de carrera (otro import paralelo
      // pudo haberlo creado entre medias → unique constraint P2002).
      try {
        return await prisma.supplier.create({ data: { name: n, taxId: taxId ?? null } });
      } catch (e: any) {
        if (e?.code === "P2002") {
          const fallback = taxId
            ? await prisma.supplier.findUnique({ where: { taxId } })
            : await prisma.supplier.findFirst({ where: { name: n } });
          if (fallback) return fallback;
        }
        throw e;
      }
    }
  },
  species: {
    list: () => prisma.species.findMany({ orderBy: { commonName: "asc" } }),
    create: (data: any) => prisma.species.create({ data }),
  },
  equivalences: {
    /**
     * Lista equivalencias ACTIVAS (por defecto). Si se pasa `includeInactive=true`
     * también devuelve las desactivadas, útil por si algún día queremos UI para
     * reactivarlas.
     */
    list: (portId?: string | null, includeInactive = false) =>
      prisma.speciesEquivalence.findMany({
        where: {
          ...(includeInactive ? {} : { active: true }),
          ...(portId ? { OR: [{ portId }, { scope: "GLOBAL" }] } : {})
        },
        include: { species: true, port: true },
        orderBy: [{ portId: "asc" }, { rawName: "asc" }]
      }),
    upsert: async (data: any) => {
      // Prisma no acepta null en claves compuestas únicas.
      // Hacemos findFirst + update/create manualmente.
      const existing = await prisma.speciesEquivalence.findFirst({
        where: { rawName: data.rawName, portId: data.portId ?? null }
      });
      if (existing) {
        return prisma.speciesEquivalence.update({
          where: { id: existing.id },
          data
        });
      }
      return prisma.speciesEquivalence.create({ data });
    },
    remove: (id: string) => prisma.speciesEquivalence.update({ where: { id }, data: { active: false } })
  },
  formats: {
    list: () => prisma.documentFormat.findMany({ include: { port: true }, orderBy: { name: "asc" } }),
    upsert: (data: any) =>
      prisma.documentFormat.upsert({ where: { code: data.code }, update: data, create: data })
  }
};

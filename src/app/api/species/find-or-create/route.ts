import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * Busca una especie por nombre común (case-insensitive). Si no existe, la crea
 * con un código auto-generado a partir del nombre y la devuelve. Si el texto
 * viene con "(CÓDIGO)" al final (tal y como se muestra en la UI), intenta
 * resolver por código primero.
 *
 * Diseñado para que el cliente no tenga que gestionar la unicidad del código
 * ni las condiciones de carrera cuando se añade una especie nueva desde la UI
 * de equivalencias.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const { name } = await req.json();
    const text = String(name ?? "").trim();
    if (!text) return fail(400, "El nombre de la especie no puede quedar vacío.");

    // Separa nombre y código si viene en formato "Nombre (CÓDIGO)".
    const codeMatch = text.match(/\(([A-Z0-9]{2,8})\)\s*$/);
    const cleanName = text.replace(/\s*\([A-Z0-9]{2,8}\)\s*$/, "").trim();

    // 1) Por código si se especificó. Si el nombre tecleado difiere del guardado
    //    (ej. BRECA vs Breca), actualizamos el nombre a lo que el usuario escribió.
    if (codeMatch) {
      const byCode = await prisma.species.findUnique({ where: { code: codeMatch[1] } });
      if (byCode) {
        if (cleanName && byCode.commonName !== cleanName) {
          const renamed = await prisma.species.update({
            where: { id: byCode.id },
            data: { commonName: cleanName }
          });
          await audit({
            userId: s.sub, entity: "Species", entityId: renamed.id, action: "UPDATE",
            field: "commonName", oldValue: byCode.commonName, newValue: cleanName
          });
          return ok(renamed);
        }
        return ok(byCode);
      }
    }

    // 2) Por nombre común (case-insensitive). Si el casing difiere, renombramos
    //    la ficha al casing que escribió el usuario.
    if (cleanName) {
      const byName = await prisma.species.findFirst({
        where: { commonName: { equals: cleanName, mode: "insensitive" } }
      });
      if (byName) {
        if (byName.commonName !== cleanName) {
          const renamed = await prisma.species.update({
            where: { id: byName.id },
            data: { commonName: cleanName }
          });
          await audit({
            userId: s.sub, entity: "Species", entityId: renamed.id, action: "UPDATE",
            field: "commonName", oldValue: byName.commonName, newValue: cleanName
          });
          return ok(renamed);
        }
        return ok(byName);
      }
    }

    // 3) Crear nueva con código auto-generado
    const base = cleanName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");

    for (let i = 0; i < 50; i++) {
      const candidateCode = i === 0 ? base : (base.slice(0, 2) + (i + 1)).slice(0, 4);
      try {
        const created = await prisma.species.create({
          data: { code: candidateCode, commonName: cleanName, scientificName: null, active: true }
        });
        await audit({
          userId: s.sub, entity: "Species", entityId: created.id, action: "CREATE",
          newValue: { code: candidateCode, commonName: cleanName, source: "equivalences-inline" }
        });
        return ok(created, 201);
      } catch (e: any) {
        if (e?.code === "P2002") continue;        // código ya existe, probar el siguiente
        throw e;
      }
    }
    return fail(500, "No se pudo generar un código único para esa especie.");
  } catch (e) { return handle(e); }
}

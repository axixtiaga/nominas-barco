import { NextRequest } from "next/server";
import { fail, handle } from "@/lib/http";
import { invoicesRepo } from "@/lib/repositories/invoices";
import { requireSession } from "@/lib/session";
import { toCsv } from "@/lib/export/csv";
import { toXlsx } from "@/lib/export/excel";
import { toPdf } from "@/lib/export/pdf";

export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    const invoices = await invoicesRepo.list({
      from: q.get("from") ? new Date(q.get("from")!) : undefined,
      to: q.get("to") ? new Date(q.get("to")!) : undefined,
      portId: q.get("portId") ?? undefined,
      boatId: q.get("boatId") ?? undefined,
      supplierId: q.get("supplierId") ?? undefined,
      speciesId: q.get("speciesId") ?? undefined
    });

    // Aplanamos a filas por línea
    const rows = invoices.flatMap(inv => (inv.lines.length ? inv.lines : [null] as any[]).map((l: any) => ({
      factura: inv.invoiceNumber ?? "",
      fecha: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : "",
      puerto: inv.port?.name ?? "",
      barco: inv.boat?.name ?? "",
      proveedor: inv.supplier?.name ?? "",
      especie_original: l?.rawSpeciesName ?? "",
      especie_normalizada: l?.species?.commonName ?? "",
      descripcion: l?.description ?? "",
      kilos: l ? Number(l.kilos) : 0,
      precio_kg: l ? Number(l.pricePerKg) : 0,
      importe: l ? Number(l.amount) : 0,
      iva_pct: l ? Number(l.vatRate) : 0,
      iva_eur: l ? Number(l.vatAmount) : 0,
      subtotal: Number(inv.subtotal),
      impuestos: Number(inv.taxes),
      tasas: Number(inv.fees),
      otros: Number(inv.other),
      total: Number(inv.total),
      moneda: inv.currency,
      estado: inv.status
    })));

    switch (params.kind) {
      case "csv": {
        const body = toCsv(rows);
        return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=capturas.csv" } });
      }
      case "xlsx": {
        const buf = await toXlsx(rows);
        return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=capturas.xlsx" } });
      }
      case "pdf": {
        const buf = await toPdf(rows, "Capturas");
        return new Response(buf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=capturas.pdf" } });
      }
      default: return fail(400, "Tipo de exportación no soportado");
    }
  } catch (e) { return handle(e); }
}

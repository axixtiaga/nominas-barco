import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AnalysisClient } from "@/components/AnalysisClient";

const ALLOWED = ["species", "port", "supplier", "daily", "weekly", "monthly"] as const;

export default async function AnalysisPage({ params }: { params: { dim: string } }) {
  if (!ALLOWED.includes(params.dim as any)) return notFound();

  const [ports, species, yearsRows] = await Promise.all([
    prisma.port.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.species.findMany({ orderBy: { commonName: "asc" }, select: { id: true, commonName: true } }),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT EXTRACT(YEAR FROM "issueDate")::int AS year
         FROM "Invoice"
        WHERE "issueDate" IS NOT NULL AND status = 'VERIFIED'
        ORDER BY year DESC`
    )
  ]);
  const availableYears: number[] = yearsRows.map(r => Number(r.year));

  return (
    <div className="space-y-4">
      <Link href="/panel" className="text-sm text-blue-600 hover:underline">← Volver al dashboard</Link>
      <AnalysisClient dim={params.dim} ports={ports} species={species} availableYears={availableYears} />
    </div>
  );
}

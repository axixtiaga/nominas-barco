type Row = Record<string, string | number | null | undefined>;

export function toCsv(rows: Row[], headers?: string[]): string {
  if (!rows.length) return (headers ?? []).join(";") + "\n";
  const cols = headers ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map(r => cols.map(c => esc(r[c])).join(";")).join("\n");
  return "\uFEFF" + cols.join(";") + "\n" + body + "\n";
}

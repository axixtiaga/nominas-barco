// Adaptador para pdf-parse (extracción de texto plano de un PDF)
// Separado para poder mockearlo en tests si hiciera falta.

// @ts-ignore — pdf-parse no trae tipos oficiales
import pdf from "pdf-parse/lib/pdf-parse.js";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const res = await pdf(buffer);
  return (res?.text ?? "").toString();
}

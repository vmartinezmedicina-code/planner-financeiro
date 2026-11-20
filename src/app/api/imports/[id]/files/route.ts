import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getCategoryOptions } from "@/lib/categories";
import { todayInputValue } from "@/lib/format";
import { aiConfigured, AiError } from "@/lib/ai/provider";
import { invoiceLabel } from "@/lib/invoices/invoicePeriod";
import { CsvError, parseStatementCsv } from "@/lib/imports/csv";
import { extractDocument } from "@/lib/imports/extract";
import { addLines, ImportError, linesFromCsv, linesFromExtraction } from "@/lib/imports/importService";

// A leitura de um PDF/foto pela IA leva de alguns segundos a ~1 minuto.
export const maxDuration = 300;

const MAX_BYTES = 4 * 1024 * 1024; // limite de corpo da Vercel ≈ 4,5 MB

function mediaTypeOf(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return "text/csv";
  if (file.type) return file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const hh = session.householdId;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const index = Number(form?.get("index") ?? 0) || 0;
  if (!file || typeof file === "string") return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo acima de 4 MB. Envie menos páginas por vez." }, { status: 413 });

  const imp = await prisma.importSession.findFirst({ where: { id, householdId: hh } });
  if (!imp) return NextResponse.json({ error: "Importação não encontrada." }, { status: 404 });
  const target = imp.target as "CARD" | "BANK";
  const mediaType = mediaTypeOf(file);

  try {
    if (mediaType === "text/csv" || mediaType === "application/vnd.ms-excel" || mediaType === "text/plain") {
      const { rows, skipped } = parseStatementCsv(await file.text());
      const lines = linesFromCsv(rows, target);
      const warnings = skipped ? [`${skipped} linha(s) sem data/valor ignoradas.`] : [];
      const added = await addLines(id, hh, { name: file.name, index }, lines, { warnings });
      return NextResponse.json({ added, warnings });
    }

    if (!aiConfigured()) {
      return NextResponse.json({ error: "Leitura de PDF/foto precisa da IA: configure ANTHROPIC_API_KEY. CSV funciona sem ela." }, { status: 400 });
    }

    const [categories, account] = await Promise.all([
      getCategoryOptions(hh),
      target === "CARD"
        ? prisma.creditCard.findFirst({ where: { id: imp.creditCardId ?? "", householdId: hh }, select: { name: true } })
        : prisma.bank.findFirst({ where: { id: imp.bankId ?? "", householdId: hh }, select: { name: true } }),
    ]);
    if (!account) return NextResponse.json({ error: "A conta/cartão desta importação não existe mais." }, { status: 400 });

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const doc = await extractDocument(
      { mediaType, base64 },
      {
        target,
        accountName: account.name,
        todayIso: todayInputValue(),
        invoiceLabel: imp.invoiceYear && imp.invoiceMonth ? invoiceLabel(imp.invoiceYear, imp.invoiceMonth) : null,
        categories: categories.map((c) => ({ id: c.id, type: c.type, label: c.label })),
      }
    );
    const { lines, invalid } = linesFromExtraction(doc, target);
    const warnings = [
      doc.warnings,
      invalid ? `${invalid} linha(s) sem data ou valor legível foram ignoradas.` : "",
      doc.truncated ? "Documento longo: parte das linhas pode ter ficado de fora. Envie em partes." : "",
      doc.documentType === "OTHER" && lines.length === 0 ? "Não parece uma fatura, extrato ou comprovante." : "",
    ].filter(Boolean);
    const added = await addLines(id, hh, { name: file.name, index }, lines, {
      institution: doc.institution || null,
      statementTotalCents: doc.statementTotal ? Math.round(doc.statementTotal * 100) : null,
      warnings,
    });
    return NextResponse.json({ added, warnings });
  } catch (e) {
    if (e instanceof ImportError || e instanceof AiError || e instanceof CsvError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

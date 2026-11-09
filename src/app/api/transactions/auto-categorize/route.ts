import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionKind } from "@prisma/client";
import { CONSUMPTION_KINDS } from "@/lib/finance/kinds";

// Regra automática simples: procura, na descrição do lançamento, o nome de
// alguma categoria/subcategoria já cadastrada (ignorando maiúsculas/acentos)
// e aplica a correspondência mais específica (nome mais longo) encontrada.
// Só lançamentos de consumo recebem categoria (transferências/pagamentos não).
// Na Fase 7 isto vira um motor de regras configurável (CategorizationRule).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const [categories, uncategorized] = await Promise.all([
    prisma.category.findMany({ where: { householdId: session.householdId } }),
    prisma.transaction.findMany({
      where: { householdId: session.householdId, categoryId: null, kind: { in: CONSUMPTION_KINDS as TransactionKind[] } },
    }),
  ]);

  function normalize(s: string) {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  const normalizedCategories = categories
    .map((c) => ({ id: c.id, name: normalize(c.name), type: c.type }))
    .sort((a, b) => b.name.length - a.name.length);

  let matched = 0;
  const updates: { id: string; categoryId: string }[] = [];

  for (const t of uncategorized) {
    const desc = normalize(t.description);
    const wantedType = t.kind === "INCOME" ? "RECEITA" : "DESPESA";
    const found = normalizedCategories.find((c) => c.type === wantedType && c.name.length >= 3 && desc.includes(c.name));
    if (found) {
      updates.push({ id: t.id, categoryId: found.id });
      matched++;
    }
  }

  await prisma.$transaction(
    updates.map((u) => prisma.transaction.update({ where: { id: u.id }, data: { categoryId: u.categoryId } }))
  );

  return NextResponse.json({ matched, total: uncategorized.length });
}

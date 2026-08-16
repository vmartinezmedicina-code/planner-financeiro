import { prisma } from "@/lib/prisma";

export type CategoryOption = {
  id: string;
  label: string; // caminho completo, ex: "Despesas Mensais > Alimentação > Mercado"
  type: "RECEITA" | "DESPESA";
};

export async function getCategoryOptions(): Promise<CategoryOption[]> {
  const categories = await prisma.category.findMany({ orderBy: { order: "asc" } });
  const byId = new Map(categories.map((c) => [c.id, c]));

  function pathFor(id: string): string {
    const parts: string[] = [];
    let current = byId.get(id);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join(" > ");
  }

  return categories.map((c) => ({ id: c.id, label: pathFor(c.id), type: c.type }));
}

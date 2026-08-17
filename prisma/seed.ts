import { CategoryType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
// Reaproveita o client de src/lib/prisma.ts: ele já escolhe automaticamente
// entre o engine clássico (SQLite local) e o adapter libSQL (Turso), conforme
// a DATABASE_URL definida no ambiente em que este script rodar.

async function upsertUser(name: string, email: string, password: string, avatarColor: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, passwordHash, avatarColor },
  });
}

async function createCategoryTree(
  type: CategoryType,
  nodes: { name: string; children?: { name: string; children?: { name: string }[] }[] }[]
) {
  let order = 0;
  for (const node of nodes) {
    const parent = await prisma.category.create({
      data: { name: node.name, type, order: order++ },
    });
    if (node.children) {
      let childOrder = 0;
      for (const child of node.children) {
        const created = await prisma.category.create({
          data: { name: child.name, type, order: childOrder++, parentId: parent.id },
        });
        if (child.children) {
          let grandOrder = 0;
          for (const grand of child.children) {
            await prisma.category.create({
              data: { name: grand.name, type, order: grandOrder++, parentId: created.id },
            });
          }
        }
      }
    }
  }
}

async function main() {
  console.log("Criando usuários...");
  const u1email = process.env.SEED_USER1_EMAIL ?? "voce@planner.local";
  const u1pass = process.env.SEED_USER1_PASSWORD ?? "mude-esta-senha-1";
  const u2email = process.env.SEED_USER2_EMAIL ?? "esposa@planner.local";
  const u2pass = process.env.SEED_USER2_PASSWORD ?? "mude-esta-senha-2";

  await upsertUser("Você", u1email, u1pass, "#6366f1");
  await upsertUser("Sua Esposa", u2email, u2pass, "#ec4899");

  const existingCategories = await prisma.category.count();
  if (existingCategories > 0) {
    console.log("Categorias já existem, pulando seed de categorias.");
  } else {
    console.log("Criando categorias padrão...");

    await createCategoryTree(CategoryType.RECEITA, [
      {
        name: "Receitas Mensais",
        children: [
          { name: "Salário" },
          { name: "Freelance / Renda Extra" },
          { name: "Rendimentos de Investimentos" },
          { name: "Outras Receitas" },
        ],
      },
    ]);

    await createCategoryTree(CategoryType.DESPESA, [
      {
        name: "Despesas Mensais",
        children: [
          {
            name: "Moradia",
            children: [{ name: "Aluguel/Financiamento" }, { name: "Condomínio" }, { name: "IPTU" }, { name: "Manutenção" }],
          },
          {
            name: "Alimentação",
            children: [{ name: "Mercado" }, { name: "Feira" }, { name: "Açougue" }, { name: "Restaurantes" }],
          },
          {
            name: "Contas e Utilidades",
            children: [{ name: "Energia" }, { name: "Água" }, { name: "Internet" }, { name: "Telefone" }, { name: "Gás" }],
          },
          {
            name: "Transporte",
            children: [{ name: "Combustível" }, { name: "Transporte por App" }, { name: "Manutenção do Carro" }, { name: "Estacionamento" }],
          },
          {
            name: "Saúde",
            children: [{ name: "Plano de Saúde" }, { name: "Farmácia" }, { name: "Consultas" }],
          },
          {
            name: "Educação",
            children: [{ name: "Mensalidade" }, { name: "Cursos" }, { name: "Material" }],
          },
          {
            name: "Lazer",
            children: [{ name: "Streaming" }, { name: "Passeios" }, { name: "Viagens" }],
          },
          {
            name: "Cartão de Crédito",
            children: [{ name: "Fatura" }],
          },
          {
            name: "Outras Despesas",
            children: [{ name: "Diversos" }],
          },
        ],
      },
    ]);
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

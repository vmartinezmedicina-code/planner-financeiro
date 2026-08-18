import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/categories";

const bodySchema = z.object({
  text: z.string().min(1).max(500),
});

// Schema forçado na resposta da IA (structured outputs) — garante que a
// resposta sempre venha nesse formato exato, sem precisar fazer parsing de
// texto livre nem correr risco de a IA "inventar" um JSON malformado.
const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    description: { type: "string", description: "Descrição curta do lançamento" },
    amount: { type: "number", description: "Valor absoluto (sempre positivo), em reais, com até 2 casas decimais" },
    kind: { type: "string", enum: ["despesa", "receita"] },
    categoryId: {
      type: "string",
      description: "ID exato de uma das categorias fornecidas na lista, ou string vazia se nenhuma combinar bem",
    },
    paymentMethod: { type: "string", enum: ["DEBITO", "CREDITO", "PIX", "DINHEIRO"] },
    bankId: {
      type: "string",
      description: "ID exato de um dos bancos fornecidos (só quando paymentMethod não é CREDITO), ou string vazia",
    },
    creditCardId: {
      type: "string",
      description: "ID exato de um dos cartões fornecidos (só quando paymentMethod é CREDITO), ou string vazia",
    },
    eventDate: { type: "string", description: "Data da compra, formato YYYY-MM-DD" },
    settlementDate: {
      type: "string",
      description: "Data de efetivação/pagamento, formato YYYY-MM-DD, ou string vazia se não foi mencionada",
    },
    confidence: { type: "string", enum: ["alta", "media", "baixa"] },
    warning: { type: "string", description: "Aviso curto se algo ficou ambíguo, ou string vazia" },
  },
  required: [
    "description",
    "amount",
    "kind",
    "categoryId",
    "paymentMethod",
    "bankId",
    "creditCardId",
    "eventDate",
    "settlementDate",
    "confidence",
    "warning",
  ],
  additionalProperties: false,
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Lançamento por texto não configurado. Gere uma chave em console.anthropic.com e adicione ANTHROPIC_API_KEY ao arquivo .env.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const [categories, banks, creditCards] = await Promise.all([
    getCategoryOptions(),
    prisma.bank.findMany({ select: { id: true, name: true } }),
    prisma.creditCard.findMany({ select: { id: true, name: true } }),
  ]);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const categoryList = categories
    .map((c) => `${c.id} | ${c.type} | ${c.label}`)
    .join("\n");
  const bankList = banks.map((b) => `${b.id} | ${b.name}`).join("\n") || "(nenhum banco cadastrado)";
  const cardList = creditCards.map((c) => `${c.id} | ${c.name}`).join("\n") || "(nenhum cartão cadastrado)";

  const systemPrompt = `Você extrai dados estruturados de uma mensagem curta descrevendo um lançamento financeiro
(compra, pagamento, recebimento) escrita em português do Brasil, para um app de controle financeiro.

Hoje é ${todayIso}. Use essa data para interpretar termos relativos ("hoje", "ontem", "dia 5").

Categorias cadastradas (use o ID exato de uma delas — prefira a subcategoria mais específica que fizer sentido;
se nada combinar bem, deixe categoryId como string vazia):
${categoryList}

Bancos cadastrados (use só se a forma de pagamento NÃO for crédito):
${bankList}

Cartões de crédito cadastrados (use só se a forma de pagamento FOR crédito):
${cardList}

Regras importantes:
- paymentMethod CREDITO -> preencha creditCardId (se houver um cartão claro na mensagem ou só um cadastrado) e deixe bankId vazio.
- paymentMethod DEBITO, PIX ou DINHEIRO -> preencha bankId (se houver banco claro na mensagem ou só um cadastrado) e deixe creditCardId vazio.
- Se a mensagem não deixar clara a forma de pagamento, use DEBITO como padrão e avise em "warning".
- settlementDate só deve ser preenchida se a mensagem falar explicitamente de quando foi/será pago (ex: "cai dia 10", "já pago", "pago hoje"); senão deixe vazia.
- amount é sempre um número positivo, mesmo para despesas.
- Nunca invente um ID de categoria, banco ou cartão que não esteja nas listas acima.`;

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      },
      system: systemPrompt,
      messages: [{ role: "user", content: parsed.data.text }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Não consegui interpretar essa mensagem." }, { status: 400 });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Resposta vazia da IA." }, { status: 500 });
    }

    const data = JSON.parse(textBlock.text);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao interpretar lançamento:", error);
    return NextResponse.json({ error: "Erro ao interpretar a mensagem. Tente novamente ou preencha manualmente." }, { status: 500 });
  }
}

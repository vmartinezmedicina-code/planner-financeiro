import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { buildFinancialContext } from "@/lib/financialContext";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .min(1)
    .max(40),
});

const SYSTEM_PROMPT = `Você é o assistente financeiro do Planner Financeiro, um app de controle financeiro pessoal/familiar usado por um casal.
Converse em português do Brasil, de forma direta e prática. Use os dados financeiros fornecidos como contexto para responder perguntas,
sugerir ajustes de orçamento, comentar gastos, ajudar a planejar metas e discutir investimentos. Não invente números — baseie-se apenas
no resumo financeiro fornecido; se faltar informação para responder algo com precisão, diga isso e sugira onde no app essa informação
poderia ser cadastrada (Planejamento, Lançamentos, Bancos, Cartões ou Investimentos). Não dê recomendações de investimento específicas
e personalizadas como se fosse consultoria financeira licenciada — pode comentar de forma educativa e geral.`;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Chat com IA não configurado. Gere uma chave em console.anthropic.com e adicione ANTHROPIC_API_KEY ao arquivo .env.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const financialContext = await buildFinancialContext();

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: financialContext },
      ],
      messages: parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "O assistente não conseguiu responder a essa mensagem." }, { status: 400 });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Erro no chat com IA:", error);
    return NextResponse.json({ error: "Erro ao consultar o assistente. Tente novamente." }, { status: 500 });
  }
}

import type Anthropic from "@anthropic-ai/sdk";
import { AiError, aiModel, anthropic, responseText } from "@/lib/ai/provider";

/**
 * Leitura de fatura / extrato / comprovante (PDF ou imagem) pela IA, com saída
 * estruturada. A IA só transcreve e sugere (tipo da linha, categoria); datas,
 * sinais, parcelas futuras, faturas e duplicidades são resolvidos pelo sistema.
 */

export const ITEM_TYPES = ["PURCHASE", "REFUND", "FEE", "BILL_PAYMENT", "INCOME", "EXPENSE", "OWN_TRANSFER", "INVESTMENT"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type ExtractedItem = {
  date: string; // YYYY-MM-DD
  original: string;
  name: string;
  amount: number; // positivo, em reais
  type: ItemType;
  direction: "IN" | "OUT"; // entrada (crédito) ou saída (débito)
  installment: string; // "3/10" ou ""
  categoryId: string;
};

export type ExtractedDoc = {
  documentType: "CARD_STATEMENT" | "BANK_STATEMENT" | "RECEIPT" | "OTHER";
  institution: string;
  referenceMonth: string; // YYYY-MM ou ""
  statementTotal: number; // 0 quando não aparece
  items: ExtractedItem[];
  warnings: string;
  truncated: boolean;
};

const SCHEMA = {
  type: "object" as const,
  properties: {
    documentType: { type: "string", enum: ["CARD_STATEMENT", "BANK_STATEMENT", "RECEIPT", "OTHER"] },
    institution: { type: "string", description: "Banco/emissor que aparece no documento, ou string vazia" },
    referenceMonth: { type: "string", description: "Mês da fatura (YYYY-MM) quando o documento informa, senão string vazia" },
    statementTotal: { type: "number", description: "Total da fatura/comprovante em reais, se aparecer; senão 0" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          original: { type: "string", description: "Descrição exatamente como impressa" },
          name: { type: "string", description: "Nome limpo e curto do estabelecimento ou da movimentação" },
          amount: { type: "number", description: "Valor absoluto (positivo) em reais" },
          type: { type: "string", enum: [...ITEM_TYPES] },
          direction: { type: "string", enum: ["IN", "OUT"], description: "IN = dinheiro entrando/crédito; OUT = saindo/débito" },
          installment: { type: "string", description: "Parcela no formato n/N, ou string vazia" },
          categoryId: { type: "string", description: "ID de uma categoria da lista, ou string vazia" },
        },
        required: ["date", "original", "name", "amount", "type", "direction", "installment", "categoryId"],
        additionalProperties: false,
      },
    },
    warnings: { type: "string", description: "Avisos curtos (texto ilegível, página cortada), ou string vazia" },
  },
  required: ["documentType", "institution", "referenceMonth", "statementTotal", "items", "warnings"],
  additionalProperties: false,
};

export type ExtractContext = {
  target: "CARD" | "BANK";
  accountName: string;
  todayIso: string;
  invoiceLabel: string | null; // ex.: "novembro/2026"
  categories: { id: string; type: string; label: string }[];
};

function systemPrompt(ctx: ExtractContext): string {
  const cats = ctx.categories
    .filter((c) => ctx.target === "BANK" || c.type === "DESPESA")
    .map((c) => `${c.id} | ${c.type} | ${c.label}`)
    .join("\n");

  const common = `Você transcreve documentos financeiros brasileiros (faturas de cartão, extratos, prints de aplicativo de banco,
comprovantes e notas) para um app de controle financeiro familiar. Seja fiel ao documento: não invente linhas nem valores.

Hoje é ${ctx.todayIso}.

Regras gerais:
- Uma linha de "items" por movimentação. Ignore cabeçalhos, totais, subtotais, saldos, limites, resumo da fatura e propaganda.
- "amount" é sempre positivo; o sentido vai em "direction" (IN entrada/crédito, OUT saída/débito) e a natureza em "type".
- "date" no formato YYYY-MM-DD. Quando o documento mostra só dia/mês, deduza o ano: as datas das compras ficam
  no mês da fatura ou antes dele (parcelas antigas podem ser do ano anterior); nunca depois de hoje, exceto lançamentos futuros explícitos.
- "original" é a descrição exatamente como aparece; "name" é o nome limpo da loja/pessoa (ex.: "IFD*IFOOD CLUB" → "iFood").
- "installment": se a linha indicar parcela (ex.: "PARC 03/10", "3 de 10", "03/10" ao lado da loja), escreva "3/10"; senão "".
  Use a data impressa na linha (normalmente a da compra original).
- "categoryId": o ID exato da categoria mais específica que combinar, só se tiver boa certeza; senão "". Nunca invente ID.
- Se uma parte estiver ilegível ou cortada, transcreva o que conseguir e explique em "warnings".

Categorias:
${cats || "(nenhuma)"}`;

  if (ctx.target === "CARD") {
    return `${common}

Este documento é do cartão de crédito "${ctx.accountName}"${ctx.invoiceLabel ? `, fatura de ${ctx.invoiceLabel}` : ""}.
Tipos:
- PURCHASE: compra (inclusive parcelada, assinatura, compra internacional já convertida em reais).
- REFUND: estorno, crédito, devolução, cashback lançado na fatura.
- FEE: IOF, anuidade, juros, multa, encargos, tarifa, seguro do cartão.
- BILL_PAYMENT: pagamento da fatura ("pagamento recebido", "pagamento efetuado").
Se for um comprovante/nota de uma única compra, gere UM item com o total pago (não liste os produtos).`;
  }
  return `${common}

Este documento é da conta bancária "${ctx.accountName}" (extrato, print do app ou comprovante).
Tipos:
- INCOME: entrada (salário, PIX recebido, depósito, reembolso).
- EXPENSE: saída (compra no débito, PIX enviado, boleto, tarifa, saque).
- BILL_PAYMENT: pagamento de fatura de cartão de crédito.
- OWN_TRANSFER: transferência entre contas da própria família/mesmo titular.
- INVESTMENT: aplicação ou resgate de investimento/poupança.
Se for um comprovante de um único pagamento, gere UM item.`;
}

export type FileInput = { mediaType: string; base64: string };

export async function extractDocument(file: FileInput, ctx: ExtractContext): Promise<ExtractedDoc> {
  let source: Anthropic.Messages.ContentBlockParam;
  if (file.mediaType === "application/pdf") {
    source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } };
  } else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mediaType)) {
    source = {
      type: "image",
      source: { type: "base64", media_type: file.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: file.base64 },
    };
  } else {
    throw new AiError("Formato não suportado. Envie PDF, JPG, PNG ou WebP.");
  }

  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic().messages.create({
      model: aiModel(),
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: systemPrompt(ctx), cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: "Transcreva as movimentações deste documento." }],
        },
      ],
    });
  } catch (e) {
    console.error("Erro na leitura do documento pela IA:", e);
    const status = (e as { status?: number }).status;
    if (status === 413) throw new AiError("Arquivo grande demais para leitura. Envie menos páginas por vez.");
    if (status === 429 || status === 529) throw new AiError("A IA está sobrecarregada agora. Tente de novo em instantes.");
    throw new AiError("Não consegui ler este arquivo agora. Tente novamente.");
  }

  if (response.stop_reason === "refusal") throw new AiError("A IA não conseguiu processar este arquivo.");
  const text = responseText(response.content);
  if (!text) throw new AiError("A leitura voltou vazia.");
  const truncated = response.stop_reason === "max_tokens";
  try {
    const data = JSON.parse(text) as Omit<ExtractedDoc, "truncated">;
    return { ...data, items: Array.isArray(data.items) ? data.items : [], truncated };
  } catch {
    throw new AiError(
      truncated
        ? "O documento tem linhas demais para uma leitura só. Envie em partes (por página ou por prints)."
        : "Não consegui entender a leitura deste arquivo. Tente novamente."
    );
  }
}

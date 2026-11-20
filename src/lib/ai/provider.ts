import Anthropic from "@anthropic-ai/sdk";

/**
 * Ponto único de acesso à IA. O modelo vem de ANTHROPIC_MODEL (padrão
 * claude-opus-5-5); a chave, de ANTHROPIC_API_KEY. A IA só interpreta
 * (extrai, sugere); todo cálculo financeiro é feito pelo sistema.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export class AiError extends Error {}

/** Texto do primeiro bloco de texto da resposta (saída estruturada vem como JSON aqui). */
export function responseText(content: Anthropic.Messages.ContentBlock[]): string | null {
  const block = content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : null;
}

/**
 * Prepara um arquivo para envio (no navegador): fotos são reduzidas para no
 * máximo 2000 px no lado maior e recomprimidas em JPEG — a IA não precisa de
 * mais que isso e o limite de envio da Vercel é ~4,5 MB. PDF e CSV vão como estão.
 */
const MAX_SIDE = 2000;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export class PrepareError extends Error {}

export function isImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export async function prepareFile(file: File): Promise<File> {
  if (!isImage(file)) {
    if (file.size > MAX_UPLOAD_BYTES) throw new PrepareError("Arquivo acima de 4 MB: envie menos páginas por vez.");
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PrepareError("Não consegui abrir esta imagem (HEIC?). Envie como JPG/PNG ou tire um print da tela.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PrepareError("Seu navegador não conseguiu preparar a imagem.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new PrepareError("Seu navegador não conseguiu preparar a imagem.");
  const base = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

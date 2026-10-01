/** Bound memory even when Content-Length is absent or forged. */
export async function readLimitedBody(
  request: Request,
  maximum: number,
): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new RangeError("Pacote muito grande.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new RangeError("Pacote muito grande.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

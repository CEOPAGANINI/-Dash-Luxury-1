import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para credenciais de integrações.
 *
 * Tokens de terceiros (Meta CAPI, gateways) nunca são gravados em texto
 * puro no banco. A chave vem de ENCRYPTION_KEY; se ausente, derivamos do
 * SUPABASE_SERVICE_ROLE_KEY para não bloquear o funcionamento — mas o ideal
 * é definir ENCRYPTION_KEY explicitamente (openssl rand -base64 32).
 */
function getKey(): Buffer {
  const raw =
    process.env.ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY não configurada — necessária para guardar credenciais com segurança.",
    );
  }
  // Normaliza qualquer entrada para 32 bytes.
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Credencial criptografada em formato inválido.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

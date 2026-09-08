import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM 推荐 96-bit IV
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("缺少 ENCRYPTION_KEY 环境变量（需 32 字节 base64）");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY 解码后需 32 字节，当前 ${key.length} 字节`);
  }
  return key;
}

/** AES-256-GCM 加密。输出 base64，内部布局：iv(12) + tag(16) + ciphertext。 */
export function encrypt(plain: string): string {
  return encryptWithKey(plain, getKey());
}

/** AES-256-GCM 解密。输入 encrypt 的产物；篡改或密钥不符则抛错。 */
export function decrypt(payload: string): string {
  return decryptWithKey(payload, getKey());
}

/** 用指定密钥加密（备份跨环境还原时重加密用；key 为 32 字节 Buffer） */
export function encryptWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** 用指定密钥解密；篡改或密钥不符则抛错 */
export function decryptWithKey(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** 用于种子脚本/测试：生成 32 字节 base64 密钥 */
export function generateKey(): string {
  return randomBytes(32).toString("base64");
}

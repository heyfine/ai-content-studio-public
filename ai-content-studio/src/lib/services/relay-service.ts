import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX_LEN = 12;
const RELAY_KEY_PREFIX = "sk-relay-";

export interface RelayKeyRow {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaskedRelayKey {
  id: string;
  name: string;
  keyMasked: string;
  keyPrefix: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelayModelItem {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

function generateSecret(): string {
  return RELAY_KEY_PREFIX + randomBytes(24).toString("hex");
}

function maskRow(row: RelayKeyRow): MaskedRelayKey {
  return {
    id: row.id,
    name: row.name,
    keyMasked: `${row.keyPrefix}••••`,
    keyPrefix: row.keyPrefix,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createRelayKey(
  name: string,
): Promise<{ row: MaskedRelayKey; secret: string }> {
  const secret = generateSecret();
  const keyPrefix = secret.slice(0, KEY_PREFIX_LEN);
  const row = await prisma.relayApiKey.create({
    data: { name, key: encrypt(secret), keyPrefix },
  });
  return { row: maskRow(row), secret };
}

export async function listRelayKeys(): Promise<MaskedRelayKey[]> {
  const rows = await prisma.relayApiKey.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(maskRow);
}

export async function revealRelayKey(id: string): Promise<string> {
  const row = await prisma.relayApiKey.findUnique({ where: { id } });
  if (!row) {
    throw new Error("中转密钥不存在");
  }
  return decrypt(row.key);
}

export async function setRelayKeyEnabled(id: string, enabled: boolean): Promise<RelayKeyRow> {
  return prisma.relayApiKey.update({ where: { id }, data: { enabled } });
}

export async function deleteRelayKey(id: string): Promise<RelayKeyRow> {
  return prisma.relayApiKey.delete({ where: { id } });
}

export async function validateRelayKey(raw: string): Promise<RelayKeyRow | null> {
  if (!raw) return null;
  const prefix = raw.slice(0, KEY_PREFIX_LEN);
  const candidates = await prisma.relayApiKey.findMany({
    where: { enabled: true, keyPrefix: prefix },
  });
  const rawBuf = Buffer.from(raw, "utf8");
  for (const row of candidates) {
    const decrypted = decrypt(row.key);
    const decBuf = Buffer.from(decrypted, "utf8");
    if (decBuf.length === rawBuf.length && timingSafeEqual(decBuf, rawBuf)) {
      return row;
    }
  }
  return null;
}

export async function listEnabledModels(): Promise<RelayModelItem[]> {
  const providers = await prisma.aIProvider.findMany({
    where: { enabled: true },
    include: { models: { where: { enabled: true } } },
  });
  const items: RelayModelItem[] = [];
  for (const p of providers) {
    for (const m of p.models) {
      items.push({
        id: `${p.name}/${m.name}`,
        object: "model",
        created: Math.floor(m.createdAt.getTime() / 1000),
        owned_by: p.name,
      });
    }
  }
  return items;
}

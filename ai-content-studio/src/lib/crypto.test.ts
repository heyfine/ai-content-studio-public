import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, generateKey } from "./crypto";

const KEY = generateKey();

describe("crypto encrypt/decrypt", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("加解密往返一致", () => {
    const s = "sk-this-is-a-secret-api-key-12345";
    expect(decrypt(encrypt(s))).toBe(s);
  });

  it("中文与特殊字符往返一致", () => {
    const s = "密钥 中文 test quotes";
    expect(decrypt(encrypt(s))).toBe(s);
  });

  it("同一明文两次密文不同（IV 随机）", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("密文被篡改时解密抛错", () => {
    const ct = encrypt("hello");
    const tampered = ct.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered)).toThrow();
  });

  it("缺少 ENCRYPTION_KEY 时抛错", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("密钥长度不符时抛错", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encrypt("x")).toThrow(/32 字节/);
  });
});

import { z } from "zod";

/** 新建微信公众号配置 */
export const wechatConfigSchema = z.object({
  /** 账号名称（自定义备注，仅用于自己管理） */
  name: z.string().min(1, "请填写公众号名称（备注）"),
  /** 公众号 AppID：wx 开头 + 16 位十六进制 */
  appId: z.string().regex(/^wx[0-9a-f]{16}$/i, "AppID 格式不正确（应为 wx 开头的 18 位字符串）"),
  /** 公众号 AppSecret：设置与开发 → 基本配置（需 IP 白名单配合） */
  appSecret: z.string().min(1, "请填写 AppSecret"),
  enabled: z.boolean().optional().default(true),
});

export type WechatConfigValues = z.infer<typeof wechatConfigSchema>;

/** 发送到公众号草稿：content 为前端已转换的微信格式 HTML（内联样式） */
export const wechatDraftSchema = z.object({
  articleId: z.string().min(1, "请选择文章"),
  configId: z.string().min(1, "请选择公众号账号"),
  content: z.string().min(1, "正文不能为空"),
});

export type WechatDraftValues = z.infer<typeof wechatDraftSchema>;

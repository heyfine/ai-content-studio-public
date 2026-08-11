import { z } from "zod";

/** 发布：按 articleId 发布已有文章；或按 title+content 原始内容直发（AI Studio 一键发送） */
export const wordpressPublishSchema = z
  .object({
    articleId: z.string().min(1, "请选择文章").optional(),
    configId: z.string().optional(),
    /** 发布到 WP 的状态：publish（公开发布）/ draft（草稿） */
    wpStatus: z.enum(["publish", "draft"]).optional(),
    title: z.string().optional(),
    content: z.string().optional(),
  })
  .refine((d) => Boolean(d.articleId) || (Boolean(d.title) && Boolean(d.content)), {
    message: "请提供文章（articleId）或原始内容（标题+内容）",
    path: ["articleId"],
  });

export type WordpressPublishValues = z.infer<typeof wordpressPublishSchema>;

/** 新建 WordPress 站点配置 */
export const wordpressConfigSchema = z.object({
  /** 站点名称（自定义备注，仅用于自己管理） */
  name: z.string().min(1, "请填写站点名称（备注）"),
  siteUrl: z
    .string()
    .url("站点 URL 格式不正确，需以 http(s):// 开头")
    .transform((s) => s.replace(/\/+$/, "")),
  username: z.string().min(1, "请填写 WordPress 用户名"),
  appPassword: z.string().min(1, "请填写 WordPress 应用密码"),
  enabled: z.boolean().optional().default(true),
});

export type WordpressConfigValues = z.infer<typeof wordpressConfigSchema>;

/** 更新 WordPress 站点配置（全部可选，仅更新传入字段） */
export const wordpressConfigUpdateSchema = z.object({
  name: z.string().min(1, "请填写站点名称（备注）").optional(),
  siteUrl: z
    .string()
    .url("站点 URL 格式不正确，需以 http(s):// 开头")
    .transform((s) => s.replace(/\/+$/, ""))
    .optional(),
  username: z.string().min(1, "请填写 WordPress 用户名").optional(),
  appPassword: z.string().min(1, "请填写 WordPress 应用密码").optional(),
  enabled: z.boolean().optional(),
});

export type WordpressConfigUpdateValues = z.infer<typeof wordpressConfigUpdateSchema>;

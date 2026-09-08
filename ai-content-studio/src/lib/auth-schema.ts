import { z } from "zod";

/**
 * 登录账号：自定义账号或邮箱均可（存 User.email 唯一字段）。
 * 仅要求非空白与长度上限；邮箱格式不再是硬性要求。
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, "请输入账号").max(120, "账号最长 120 字符"),
  password: z.string().min(1, "请输入密码"),
});

export type LoginValues = z.infer<typeof loginSchema>;

/** 修改用户名：可空（清空显示名），去掉首尾空白 */
export const updateProfileSchema = z.object({
  name: z.string().trim().max(50, "用户名最长 50 字符"),
});

export type UpdateProfileValues = z.infer<typeof updateProfileSchema>;

/** 修改密码：当前密码必填；新密码 ≥8 位且需二次确认一致 */
export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少 8 位").max(72, "新密码最长 72 位（bcrypt 限制）"),
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  });

export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;

import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "请输入邮箱").email("请输入有效邮箱"),
  password: z.string().min(1, "请输入密码"),
});

export type LoginValues = z.infer<typeof loginSchema>;

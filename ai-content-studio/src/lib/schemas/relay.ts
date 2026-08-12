import { z } from "zod";

export const createRelayKeySchema = z.object({
  name: z.string().min(1, "请输入名称"),
});

export type CreateRelayKeyValues = z.infer<typeof createRelayKeySchema>;

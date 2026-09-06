import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { wechatDraftSchema } from "@/lib/schemas/wechat";
import { sendArticleToWechatDraft, WechatApiError } from "@/lib/services/wechat-service";

/**
 * 送文章进公众号草稿箱。content 为前端 wechat-format 转换好的微信格式 HTML
 * （全内联样式）；标题/特色图片以服务端数据库为准，正文图与封面由本路由上传转存。
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = wechatDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const { articleId, configId, content } = parsed.data;
    const { mediaId } = await sendArticleToWechatDraft(configId, articleId, content);
    return NextResponse.json({ mediaId });
  } catch (e) {
    if (e instanceof WechatApiError) {
      // 微信业务错误（IP 白名单/权限/限额等），透传中文提示，状态码 502 上游故障
      return NextResponse.json({ error: e.message, errcode: e.code }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "发送草稿失败";
    const status = message.includes("不存在") || message.includes("封面图") ? 400 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}

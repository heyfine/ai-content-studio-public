import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveImageFile } from "@/lib/services/image-upload-service";

/** 图片上传：把编辑器粘贴/手动上传的图片落盘到本地图片库，返回公网 URL */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const form = await request.formData();
    const file = form.get("file");
    // 鸭子类型判断：jsdom/undici 的 File 类不同，instanceof 在测试与运行环境会失配
    if (!file || typeof (file as File).arrayBuffer !== "function") {
      return NextResponse.json({ error: "缺少图片文件" }, { status: 400 });
    }
    const imageFile = file as File;
    const url = await saveImageFile(imageFile.type, new Uint8Array(await imageFile.arrayBuffer()));
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "图片上传失败";
    const status = message.includes("不支持") || message.includes("小于") ? 400 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}

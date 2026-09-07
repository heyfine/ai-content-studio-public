import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listLocalImages } from "@/lib/services/image-upload-service";

/** 图片库列表：本地图片（含尺寸/修改时间/公网 URL） */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.json(await listLocalImages());
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取图片列表失败" }, { status: 500 });
  }
}

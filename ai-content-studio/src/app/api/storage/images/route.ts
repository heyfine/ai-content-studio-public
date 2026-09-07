import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEnabledStorageConfig, listRemoteImages } from "@/lib/services/storage-service";

/** 图片库「云端图片」区：列举启用中对象存储桶内前缀下的图片 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const storage = await getEnabledStorageConfig();
    if (!storage) {
      return NextResponse.json({ enabled: false, images: [] });
    }
    const images = await listRemoteImages(storage);
    return NextResponse.json({
      enabled: true,
      name: storage.name,
      publicBase: storage.publicBase,
      images,
    });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取云端图片失败" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { validateRelayKey, listEnabledModels } from "@/lib/services/relay-service";
import { extractBearerKey } from "@/lib/relay/auth";

export async function GET(request: Request) {
  const raw = extractBearerKey(request);
  const row = raw ? await validateRelayKey(raw) : null;
  if (!row) {
    return NextResponse.json(
      { error: { message: "无效或缺失的 API Key", type: "invalid_api_key" } },
      { status: 401 },
    );
  }
  const data = await listEnabledModels();
  return NextResponse.json({ object: "list", data });
}

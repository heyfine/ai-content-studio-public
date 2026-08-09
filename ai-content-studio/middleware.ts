import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Phase 1 占位中间件：暂不拦截。认证授权在第 5 步接通 next-auth 后启用。
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

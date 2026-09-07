"use client";

import { LogOut as LogOutIcon, UserRoundCog as UserRoundCogIcon } from "lucide-react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export interface UserNavProps {
  session: Session | null;
}

/** 顶栏右侧用户区：用户名（进账号设置）+ 独立退出按钮 */
export function UserNav({ session }: UserNavProps) {
  if (!session?.user) {
    return (
      <Button variant="ghost" size="sm" render={<Link href="/login" />}>
        登录
      </Button>
    );
  }
  const name = session.user.name ?? session.user.email ?? "管理员";
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/settings/profile" />}
        className="gap-2"
      >
        <UserRoundCogIcon className="size-4" />
        <span className="max-w-40 truncate">{name}</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="退出登录"
        title="退出登录"
        onClick={() => signOut({ redirectTo: "/login" })}
      >
        <LogOutIcon className="size-4" />
      </Button>
    </div>
  );
}

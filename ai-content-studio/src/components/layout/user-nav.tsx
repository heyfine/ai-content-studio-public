"use client";

import Link from "next/link";
import { LogOut as LogOutIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface UserNavProps {
  session: Session | null;
}

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
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="用户菜单" />}>
        {name.charAt(0).toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectTo: "/login" })}>
          <LogOutIcon className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

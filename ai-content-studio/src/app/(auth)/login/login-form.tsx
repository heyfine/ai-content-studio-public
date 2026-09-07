"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn as LogInIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LoginValues, loginSchema } from "@/lib/auth-schema";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setAuthError(null);
    const res = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (!res || res.error) {
      setAuthError("邮箱或密码错误");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card/80 p-8 shadow-xl shadow-primary/5 backdrop-blur-xl">
      {/* 移动端品牌头（左栏在 md 以下隐藏，这里兜底） */}
      <div className="mb-6 flex items-center gap-2.5 md:hidden">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-5 text-base font-black text-primary-foreground shadow-lg shadow-primary/25">
          A
        </span>
        <span className="text-lg font-semibold tracking-tight">AI Content Studio</span>
      </div>

      <div className="mb-6 space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">欢迎回来</h2>
        <p className="text-sm text-muted-foreground">登录你的工作台，继续创作。</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {authError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {authError}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-10 bg-background/60"
            {...register("email")}
          />
          {errors.email && (
            <p role="alert" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-10 bg-background/60"
            {...register("password")}
          />
          {errors.password && (
            <p role="alert" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-10 w-full gap-2 text-sm font-medium shadow-lg shadow-primary/25"
        >
          <LogInIcon className="size-4" />
          {isSubmitting ? "登录中…" : "登录"}
        </Button>
      </form>
    </div>
  );
}

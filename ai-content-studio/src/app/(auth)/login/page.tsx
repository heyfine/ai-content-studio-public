import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-stretch overflow-hidden bg-background">
      {/* 背景光斑：柔和品牌渐变 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 right-[-6rem] size-[32rem] rounded-full bg-chart-5/15 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 size-80 -translate-x-1/2 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      {/* 左侧品牌展示区（md+ 显示） */}
      <aside className="relative hidden flex-1 flex-col justify-between p-12 md:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-5 text-base font-black text-primary-foreground shadow-lg shadow-primary/25">
            A
          </span>
          <span className="text-lg font-semibold tracking-tight">AI Content Studio</span>
        </div>
        <div className="max-w-md space-y-6">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            让 AI 成为你的
            <span className="bg-gradient-to-r from-primary via-chart-2 to-chart-5 bg-clip-text text-transparent">
              {" "}
              内容引擎
            </span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            选题、写作、SEO、发布，一站式完成。从一句话到一个选题库，从一个标题到一篇可发布的文章。
          </p>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {[
              { dot: "bg-chart-1", text: "多供应商模型路由，按任务自动选型" },
              { dot: "bg-chart-3", text: "AI Studio 流式创作，多版本一键生成" },
              { dot: "bg-chart-4", text: "一键发布 WordPress 与公众号草稿箱" },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3">
                <span aria-hidden className={`size-1.5 rounded-full ${item.dot}`} />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} AI Content Studio · 个人内容生产工作台
        </p>
      </aside>

      {/* 右侧表单区 */}
      <main className="relative flex flex-1 items-center justify-center p-6 md:max-w-[46%]">
        <Suspense fallback={<div className="text-sm text-muted-foreground">加载中…</div>}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}

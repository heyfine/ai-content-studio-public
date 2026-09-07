import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">账号设置</h1>
        <p className="text-sm text-muted-foreground">修改显示用户名与登录密码。</p>
      </div>
      <ProfileForm email={session.user.email ?? ""} initialName={session.user.name ?? ""} />
    </div>
  );
}

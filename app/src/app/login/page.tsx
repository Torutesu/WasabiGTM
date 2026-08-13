import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { brand } from "@/brand.config";
import { LoginForm } from "./login-form";

/** SCR-021 */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium tracking-tight text-center">{brand.name}</h1>
        <p className="mt-1 mb-8 text-sm text-[var(--text-dim)] text-center">{brand.tagline}</p>
        <LoginForm />
      </div>
    </main>
  );
}

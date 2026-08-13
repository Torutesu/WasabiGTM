import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

/** SCR-001 */
export default async function NewProjectPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-medium tracking-tight">Add a product</h1>
        <p className="mt-1 mb-8 text-sm text-[var(--text-dim)]">
          Point Wasabi at the product. It reads the public surfaces, plus anything else you
          connect, and builds the strategy layer everything else is generated from.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}

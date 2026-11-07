import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { AppNav, MobileTabBar } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader session={session} />
      <div className="flex flex-1">
        <aside className="hidden sm:flex flex-col w-56 shrink-0 border-r border-border p-3 h-[calc(100vh-3.5rem)] overflow-y-auto sticky top-14">
          <AppNav />
        </aside>
        <main className="flex-1 min-w-0 p-3 sm:p-6 pb-20 sm:pb-6">{children}</main>
      </div>
      <MobileTabBar />
    </div>
  );
}

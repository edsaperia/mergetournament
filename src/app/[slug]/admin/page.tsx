import { notFound } from "next/navigation";
import { tournamentBySlug } from "../../../server/session";
import { AdminDashboard } from "./dashboard";

export default async function AdminPage(props: PageProps<"/[slug]/admin">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <h1 className="mb-4 text-xl font-bold">Admin</h1>
      <AdminDashboard slug={slug} />
    </main>
  );
}

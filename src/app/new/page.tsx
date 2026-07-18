import { NewTournamentForm } from "./new-tournament-form";

export default function NewTournamentPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Create a tournament</h1>
      <NewTournamentForm />
    </main>
  );
}

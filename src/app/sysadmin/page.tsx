import Link from "next/link";
import { getDb } from "../../db";
import { overview } from "../../services/sysadmin-service";
import { sysadminToken } from "../../server/config";
import { isSysadmin } from "../../server/session";
import { sysadminDeleteAction } from "../../server/actions";
import { ControlButton } from "../[slug]/admin/admin-controls";

// Env and cookies are runtime concerns; never bake this page at build time.
export const dynamic = "force-dynamic";

export default async function SysadminPage() {
  if (!sysadminToken()) {
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <p className="text-soft">Sysadmin is not configured: set SYSADMIN_TOKEN in the environment.</p>
      </main>
    );
  }
  if (!(await isSysadmin())) {
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <p className="text-soft">
          Operator access requires the instance token: visit /sysadmin/auth/&lt;token&gt;.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const rows = await overview(db);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold">All tournaments</h1>
      <p className="mt-1 text-sm text-muted">{rows.length} on this instance</p>
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-edge text-muted">
            <th className="py-2 pr-4 font-medium">Slug</th>
            <th className="py-2 pr-4 font-medium">Created</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Creator</th>
            <th className="py-2 pr-4 font-medium">People</th>
            <th className="py-2 pr-4 font-medium">Drafts</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-edge-faint align-baseline">
              <td className="py-2 pr-4">
                <Link className="font-medium underline" href={`/${r.slug}`}>{r.slug}</Link>
                <span className="ml-1 text-xs text-muted">{r.name !== r.slug && r.name}</span>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-muted">
                {r.createdAt.toISOString().slice(0, 10)}
              </td>
              <td className="py-2 pr-4">{r.status}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.creatorEmail ?? "—"}</td>
              <td className="py-2 pr-4 tabular-nums">{r.participantCount}</td>
              <td className="py-2 pr-4 tabular-nums">{r.draftCount}</td>
              <td className="py-2">
                <ControlButton
                  action={sysadminDeleteAction.bind(null, r.id)}
                  label="Delete"
                  primary={false}
                  confirmText={`Permanently delete "${r.slug}" and everything in it? This cannot be undone.`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

import type { NextRequest } from "next/server";
import { getDb } from "../../../../db";
import {
  auditJsonl,
  canonicalText,
  draftsBundle,
  provenanceMarkdown,
} from "../../../../services/export-service";
import { currentParticipant, tournamentBySlug } from "../../../../server/session";

/** Exports (SPEC §9): canonical.md, provenance.md, drafts.md, audit.jsonl. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[slug]/export/[kind]">) {
  const { slug, kind } = await ctx.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) return new Response("not found", { status: 404 });
  if (tournament.visibility === "participants_only" && !(await currentParticipant(slug))) {
    return new Response("unauthorized", { status: 401 });
  }

  const db = await getDb();
  const respond = (body: string, filename: string, type = "text/markdown") =>
    new Response(body, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename="${slug}-${filename}"`,
      },
    });

  switch (kind) {
    case "canonical.md": {
      const text = await canonicalText(db, tournament.id);
      if (text === null) return new Response("no canonical text (yet)", { status: 404 });
      return respond(text, "canonical.md");
    }
    case "provenance.md":
      return respond(await provenanceMarkdown(db, tournament.id), "provenance.md");
    case "drafts.md":
      return respond(await draftsBundle(db, tournament.id), "drafts.md");
    case "audit.jsonl":
      return respond(await auditJsonl(db, tournament.id), "audit.jsonl", "application/jsonl");
    default:
      return new Response("unknown export", { status: 404 });
  }
}

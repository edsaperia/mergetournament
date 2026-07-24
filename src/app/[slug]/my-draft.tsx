import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { textVersions } from "../../db/schema";
import { NumberedText } from "../numbered-text";
import { DraftEditor } from "./submit/draft-editor";

/** The participant's always-open draft editor (SPEC §4 Phase 1). */
export async function MyDraft({
  slug,
  participantId,
  template,
  readOnly = false,
}: {
  slug: string;
  participantId: string;
  template: string;
  readOnly?: boolean;
}) {
  const db = await getDb();
  const [draft] = await db
    .select()
    .from(textVersions)
    .where(and(eq(textVersions.authorId, participantId), eq(textVersions.kind, "draft")));
  if (readOnly) {
    return draft ? (
      <div className="rounded-md border border-edge">
        <NumberedText body={draft.bodyMd} />
      </div>
    ) : (
      <p className="text-faint">No draft was submitted.</p>
    );
  }
  return <DraftEditor slug={slug} initialBody={draft?.bodyMd ?? template} />;
}

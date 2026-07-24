"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../db";
import { deleteTournament } from "../../services/sysadmin-service";
import { requireSysadmin } from "../session";
import { fail, type ActionState } from "./shared";

export async function sysadminDeleteAction(tournamentId: string): Promise<ActionState> {
  try {
    await requireSysadmin();
    const db = await getDb();
    await deleteTournament(db, tournamentId);
    revalidatePath("/sysadmin");
    return { ok: true, message: "Tournament deleted." };
  } catch (e) {
    return fail(e);
  }
}

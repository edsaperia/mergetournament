/**
 * Plain words for how a merge resolved (SPEC §4), shared by the export, the
 * bracket, the workspace and the chat. Players never see the enum names
 * (agreed, bearer_flip, backstop_flip, active_advance, abandoned, walkover).
 */

export type Resolution = "agreed" | "bearer_flip" | "backstop_flip" | "active_advance" | "abandoned" | "walkover";

/** A short label, for bracket cards and the provenance export. */
export function resolutionLabel(r: string | null | undefined): string {
  switch (r) {
    case "agreed":
      return "agreed";
    case "bearer_flip":
      return "agreed · coin flip chose the carrier";
    case "backstop_flip":
      return "no agreement · coin flip between the inputs";
    case "active_advance":
      return "only one bearer took part";
    case "abandoned":
      return "abandoned · neither bearer took part";
    case "walkover":
      return "walkover";
    default:
      return "not resolved yet";
  }
}

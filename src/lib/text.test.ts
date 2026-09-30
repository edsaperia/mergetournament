import { describe, expect, it } from "vitest";
import { countWords, textSize } from "./text";

describe("textSize", () => {
  it("says empty for a blank merge text, however the blank is made", () => {
    for (const blank of ["", " ", "\n", "  \n\t\n "]) expect(textSize(blank)).toBe("empty");
  });
  it("counts words and lines otherwise, singular and plural", () => {
    expect(textSize("One")).toBe("1 word · 1 line");
    expect(textSize("Ada and Brook ran out of time.")).toBe("7 words · 1 line");
    expect(textSize("# Title\n\nBody text here.")).toBe("4 words · 3 lines");
    expect(countWords("# Title\n\nBody text here.")).toBe(4);
  });
});

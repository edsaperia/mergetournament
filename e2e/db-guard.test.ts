import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { assertConnectedTo, e2eDatabaseName } from "./db-guard";

describe("e2eDatabaseName", () => {
  it("accepts a plain URL whose database ends in _e2e", () => {
    expect(e2eDatabaseName("postgres://postgres:postgres@localhost:5432/mergetournament_e2e")).toBe(
      "mergetournament_e2e",
    );
    expect(e2eDatabaseName("postgresql://u@db.internal/x_e2e")).toBe("x_e2e");
  });

  it.each([
    ["a database not ending in _e2e", "postgres://localhost/mergetournament"],
    ["no database at all", "postgres://localhost"],
    ["?database= overriding the path", "postgres://localhost/decoy_e2e?database=victim"],
    ["any query string", "postgres://localhost/decoy_e2e?sslmode=require"],
    ["an empty query string", "postgres://localhost/decoy_e2e?"],
    ["a fragment", "postgres://localhost/decoy_e2e#victim"],
    ["a nested path", "postgres://localhost/victim/decoy_e2e"],
    ["a trailing slash", "postgres://localhost/decoy_e2e/"],
    ["dot segments", "postgres://localhost/victim/../decoy_e2e"],
    ["an encoded slash", "postgres://localhost/victim%2Fdecoy_e2e"],
    ["an encoded query", "postgres://localhost/decoy_e2e%3Fdatabase=victim"],
    ["capitals or quotes", 'postgres://localhost/"Victim_e2e"'],
    ["several hosts", "postgres://a,b/decoy_e2e"],
    ["another scheme", "mysql://localhost/decoy_e2e"],
    ["not a URL", "decoy_e2e"],
  ])("refuses %s", (_, url) => {
    expect(() => e2eDatabaseName(url)).toThrow(/refusing/);
  });
});

describe("assertConnectedTo", () => {
  const on = (db: string) => (async () => [{ db }]) as unknown as Sql;

  it("passes when the server is on the named database", async () => {
    await expect(assertConnectedTo(on("x_e2e"), "x_e2e")).resolves.toBeUndefined();
  });

  it("aborts when the server is on another database", async () => {
    await expect(assertConnectedTo(on("victim"), "decoy_e2e")).rejects.toThrow(/connected to "victim"/);
  });
});

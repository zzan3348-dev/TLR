import { readdirSync, readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);

describe("Supabase migrations", () => {
  it("uses a unique timestamp prefix for every migration", () => {
    const prefixes = readdirSync(migrationsUrl)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.split("_")[0]);

    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("migrates ownership applications from the existing assignment timestamp", () => {
    const migration = readFileSync(
      new URL("../supabase/migrations/202608290002_country_applications_site_status.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("ownership.assigned_at");
    expect(migration).not.toContain("ownership.created_at");
  });

  it("seeds every canonical capital without changing its saved coordinates", () => {
    const capitals = JSON.parse(
      readFileSync(new URL("../src/data/mapCapitals.json", import.meta.url), "utf8"),
    );
    const seed = readFileSync(
      new URL("../supabase/migrations/202609020003_seed_map_capitals.sql", import.meta.url),
      "utf8",
    );

    expect(capitals).toHaveLength(62);
    for (const capital of capitals) {
      const name = capital.name.replaceAll("'", "''");
      expect(seed).toContain(
        `('${capital.countryKey}','${name}',${capital.x},${capital.y},${capital.enabled})`,
      );
    }
  });
});

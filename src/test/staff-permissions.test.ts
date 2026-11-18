import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Permission rules the demo relies on, asserted against the applied migration
// so a future edit cannot silently weaken them.
const sql = readFileSync("drizzle/migrations/0000_staff_roles_and_demo_cloud_data.sql", "utf8");

describe("staff permission rules", () => {
  it("demo self-grant is limited to the 'staff' role (never admin)", () => {
    expect(sql).toContain("with check (auth.uid() = user_id and role = 'staff')");
  });

  it("demo alerts are readable only by staff role holders", () => {
    expect(sql).toMatch(/create policy "Staff can read demo alerts"[\s\S]*has_role\(auth\.uid\(\), 'staff'\)/);
  });

  it("demo alert status updates require the staff role", () => {
    expect(sql).toMatch(/create policy "Staff can update demo alert status"[\s\S]*has_role\(auth\.uid\(\), 'staff'\)/);
  });

  it("roles live in a dedicated user_roles table, not on user metadata", () => {
    expect(sql).toContain("create table public.user_roles");
    expect(sql).toContain("references auth.users(id) on delete cascade");
  });
});

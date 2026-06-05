import { supabase } from "@/integrations/supabase/client";

/**
 * Returns user IDs that should NOT appear in member lists / entry sheets
 * (i.e. admins, super_admins, auditors). Members are users with no elevated role.
 */
export async function fetchNonMemberIds(): Promise<Set<string>> {
  const { data } = await supabase.from("user_roles").select("user_id, role");
  return new Set(
    (data ?? [])
      .filter((r: any) => r.role !== "member")
      .map((r: any) => r.user_id),
  );
}

export function filterMembersOnly<T extends { id: string }>(rows: T[], nonMembers: Set<string>): T[] {
  return rows.filter((r) => !nonMembers.has(r.id));
}

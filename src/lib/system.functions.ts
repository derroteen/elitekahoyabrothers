import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuper(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (data?.role !== "super_admin") throw new Error("Only super admins can perform this action");
}

const ResetInput = z.object({ password: z.string().min(1) });

export const resetTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResetInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);

    // Verify dev mode
    const { data: settings } = await supabaseAdmin.from("system_settings").select("development_mode").eq("id", true).maybeSingle();
    if (!settings?.development_mode) throw new Error("System reset is disabled in Production Mode");

    // Verify password by re-authenticating super admin
    const { data: me } = await supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    if (!me?.email) throw new Error("Cannot verify identity");
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
    const { error: verr } = await verifier.auth.signInWithPassword({ email: me.email, password: data.password });
    if (verr) throw new Error("Password incorrect");

    // Wipe transactional data
    await supabaseAdmin.from("loan_repayments").delete().not("id", "is", null);
    await supabaseAdmin.from("loans").delete().not("id", "is", null);
    await supabaseAdmin.from("passbook_entries").delete().not("id", "is", null);
    await supabaseAdmin.from("savings_entries").delete().not("id", "is", null);
    await supabaseAdmin.from("announcements").delete().not("id", "is", null);
    await supabaseAdmin.from("notifications").delete().not("id", "is", null);

    // Delete every user EXCEPT super admins. Auth deletion cascades to profiles via FK; if no FK, also delete profile rows.
    const { data: supers } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "super_admin");
    const superIds = new Set((supers ?? []).map((r: any) => r.user_id));

    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      if (!list.users.length) break;
      for (const u of list.users) {
        if (superIds.has(u.id)) continue;
        await supabaseAdmin.auth.admin.deleteUser(u.id);
      }
      if (list.users.length < 200) break;
      page += 1;
    }
    // Clean orphan profile/roles rows for non-supers (safety net)
    if (superIds.size > 0) {
      const ids = Array.from(superIds);
      await supabaseAdmin.from("profiles").delete().not("id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
      await supabaseAdmin.from("user_roles").delete().not("user_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
    }

    // Reset membership counter so next member is EKB001
    await supabaseAdmin.rpc("reset_membership_seq" as any);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "SYSTEM_RESET",
      table_name: "system_settings",
      record_id: "test_data",
      new_value: { at: new Date().toISOString() },
    });

    return { ok: true };
  });

const SetModeInput = z.object({ development_mode: z.boolean() });
export const setSystemMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetModeInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);
    const { error } = await supabaseAdmin
      .from("system_settings")
      .update({ development_mode: data.development_mode, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

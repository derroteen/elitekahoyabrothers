import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertCaller(userId: string, opts: { superOnly?: boolean } = {}) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = data?.role;
  if (opts.superOnly) {
    if (role !== "super_admin") throw new Error("Only super admins can perform this action");
  } else if (role !== "super_admin" && role !== "admin") {
    throw new Error("Only admins can perform this action");
  }
  return role as "super_admin" | "admin";
}

async function audit(actorId: string, action: string, recordId: string, oldValue: any = null, newValue: any = null) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    table_name: "profiles",
    record_id: recordId,
    old_value: oldValue,
    new_value: newValue,
  });
}

const CreateInput = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional().nullable(),
  password: z.string().min(6).max(200),
  role: z.enum(["member", "auditor", "admin"]).default("member"),
});

export const adminCreateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const callerRole = await assertCaller(context.userId);
    if (data.role !== "member" && callerRole !== "super_admin") {
      throw new Error("Only super admins can assign elevated roles");
    }
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        phone: data.phone ?? null,
        role: data.role,
        must_change_password: true,
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed to create user");
    await audit(context.userId, "INSERT", created.user.id, null, { full_name: data.full_name, email: data.email, role: data.role });
    return { id: created.user.id, email: created.user.email };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().optional(),
});

export const adminUpdateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCaller(context.userId);
    const { data: prev } = await supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle();
    const { error } = await supabaseAdmin.from("profiles").update({
      full_name: data.full_name,
      phone: data.phone ?? null,
      ...(data.email ? { email: data.email } : {}),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.email && data.email !== prev?.email) {
      const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(data.id, { email: data.email, email_confirm: true });
      if (e2) throw new Error(e2.message);
    }
    await audit(context.userId, "UPDATE", data.id, prev, { ...prev, ...data });
    return { ok: true };
  });

const ResetPwInput = z.object({ id: z.string().uuid(), password: z.string().min(6).max(200) });
export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResetPwInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCaller(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
      user_metadata: { must_change_password: true },
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.id);
    await audit(context.userId, "RESET_PASSWORD", data.id);
    return { ok: true };
  });

const SetActiveInput = z.object({ id: z.string().uuid(), is_active: z.boolean() });
export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetActiveInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCaller(context.userId);
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    // Ban/unban auth user — Supabase admin: set ban_duration
    await supabaseAdmin.auth.admin.updateUserById(data.id, {
      ban_duration: data.is_active ? "none" : "876000h",
    } as any);
    await audit(context.userId, data.is_active ? "REACTIVATE" : "DEACTIVATE", data.id);
    return { ok: true };
  });

const DeleteInput = z.object({ id: z.string().uuid() });
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCaller(context.userId, { superOnly: true });
    if (data.id === context.userId) throw new Error("You cannot delete your own account");
    const { data: prev } = await supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle();
    // Block deletion if user has outstanding (non-zero balance) loans — preserve financial history
    const { data: openLoans } = await supabaseAdmin.from("loans").select("id").eq("member_id", data.id).gt("balance", 0);
    if (openLoans && openLoans.length > 0) {
      throw new Error("Cannot delete: user has outstanding loan balances. Settle loans first.");
    }
    await audit(context.userId, "DELETE", data.id, prev, null);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetRoleInput = z.object({ id: z.string().uuid(), role: z.enum(["member", "auditor", "admin", "super_admin"]) });
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetRoleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCaller(context.userId, { superOnly: true });
    const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: data.id, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    // Remove other role rows for this user (single role model)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id).neq("role", data.role);
    await audit(context.userId, "ROLE_CHANGE", data.id, null, { role: data.role });
    return { ok: true };
  });

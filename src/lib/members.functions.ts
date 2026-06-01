import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    const { supabase, userId } = context;

    // Verify caller is admin or super_admin
    const { data: roleRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    const callerRole = roleRow?.role;
    if (callerRole !== "admin" && callerRole !== "super_admin") {
      throw new Error("Only admins can create members");
    }
    if (data.role !== "member" && callerRole !== "super_admin") {
      throw new Error("Only super admins can assign elevated roles");
    }

    // Create auth user via admin API (bypasses public signup setting)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
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
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create user");
    }

    return { id: created.user.id, email: created.user.email };
  });

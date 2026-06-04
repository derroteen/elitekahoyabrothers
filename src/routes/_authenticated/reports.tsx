import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtKES, fmtDate } from "@/lib/format";
import { exportCSV, exportXLSX, exportPDF, type Column } from "@/lib/exports";
import { FileSpreadsheet, FileText, Download, Users, Banknote, PiggyBank, ClipboardList, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — EKB" }] }),
});

type ReportKey = "summary" | "members" | "loans" | "savings" | "collections" | "fines";

function ReportsPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = role === "super_admin" || role === "admin" || role === "auditor";

  const { data, isLoading } = useQuery({
    queryKey: ["reports-bundle"],
    enabled: allowed,
    queryFn: async () => {
      const [profs, roles, loans, sched, repay, savings, sheets, entries, fines] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, membership_no, is_active, date_joined"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("loans").select("*"),
        (supabase.from("loan_schedule" as any) as any).select("*"),
        supabase.from("loan_repayments").select("*"),
        supabase.from("passbook_entries").select("*"),
        (supabase.from("weekly_collections" as any) as any).select("*"),
        (supabase.from("weekly_collection_entries" as any) as any).select("*"),
        (supabase.from("loan_fines" as any) as any).select("*"),
      ]);
      const roleMap = new Map((roles.data ?? []).map((r: any) => [r.user_id, r.role]));
      const memberMap = new Map((profs.data ?? []).map((p: any) => [p.id, p]));
      return {
        members: (profs.data ?? []).map((p: any) => ({ ...p, role: roleMap.get(p.id) ?? "member" })),
        loans: (loans.data ?? []).map((l: any) => ({ ...l, member: memberMap.get(l.member_id) })),
        schedule: sched.data ?? [],
        repayments: repay.data ?? [],
        savings: (savings.data ?? []).map((s: any) => ({ ...s, member: memberMap.get(s.member_id) })),
        sheets: sheets.data ?? [],
        entries: (entries.data ?? []).map((e: any) => ({ ...e, member: memberMap.get(e.member_id) })),
        fines: fines.data ?? [],
        memberMap,
      };
    },
  });

  useEffect(() => { if (!loading && role && !allowed) navigate({ to: "/" }); }, [loading, role, allowed, navigate]);
  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!allowed) return null;

  const buildColumns = (key: ReportKey): Column[] => {
    switch (key) {
      case "members":
        return [
          { header: "Membership No", key: "membership_no", width: 14 },
          { header: "Full Name", key: "full_name", width: 28 },
          { header: "Email", key: "email", width: 28 },
          { header: "Phone", key: "phone", width: 16 },
          { header: "Role", key: "role", width: 12 },
          { header: "Active", key: "is_active_str", width: 8 },
          { header: "Joined", key: "joined_str", width: 12 },
        ];
      case "loans":
        return [
          { header: "Date", key: "loan_date", width: 12 },
          { header: "Member", key: "member_name", width: 24 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Borrowed", key: "amount_borrowed", align: "right", width: 12 },
          { header: "Rate %", key: "interest_rate", align: "right", width: 8 },
          { header: "Term (m)", key: "loan_term_months", align: "right", width: 9 },
          { header: "Frequency", key: "payment_frequency", width: 10 },
          { header: "Insurance", key: "insurance", align: "right", width: 11 },
          { header: "Total Repay", key: "total_repayable", align: "right", width: 13 },
          { header: "Paid", key: "amount_paid", align: "right", width: 12 },
          { header: "Balance", key: "balance", align: "right", width: 12 },
          { header: "Status", key: "status", width: 10 },
        ];
      case "savings":
        return [
          { header: "Date", key: "entry_date", width: 12 },
          { header: "Member", key: "member_name", width: 24 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Type", key: "entry_type", width: 12 },
          { header: "Amount", key: "amount", align: "right", width: 12 },
          { header: "Balance", key: "balance", align: "right", width: 12 },
          { header: "Notes", key: "notes", width: 24 },
        ];
      case "collections":
        return [
          { header: "Week", key: "week_number", width: 6 },
          { header: "Date", key: "collection_date", width: 12 },
          { header: "Member", key: "member_name", width: 24 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Contribution", key: "contribution", align: "right", width: 12 },
          { header: "Loan Repayment", key: "loan_repayment", align: "right", width: 13 },
          { header: "Penalty", key: "penalty", align: "right", width: 10 },
          { header: "Total", key: "total", align: "right", width: 12 },
        ];
      case "fines":
        return [
          { header: "Member", key: "member_name", width: 24 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Total Charged", key: "total_charged", align: "right", width: 14 },
          { header: "Total Paid", key: "total_paid", align: "right", width: 14 },
          { header: "Outstanding", key: "outstanding", align: "right", width: 14 },
        ];
      default:
        return [];
    }
  };

  const buildRows = (key: ReportKey): any[] => {
    if (!data) return [];
    switch (key) {
      case "members":
        return data.members.map((m: any) => ({
          ...m,
          is_active_str: m.is_active ? "Yes" : "No",
          joined_str: fmtDate(m.date_joined),
        }));
      case "loans":
        return data.loans.map((l: any) => ({
          ...l,
          loan_date: fmtDate(l.loan_date),
          member_name: l.member?.full_name ?? "—",
          member_no: l.member?.membership_no ?? "—",
          amount_borrowed: fmtKES(l.amount_borrowed),
          insurance: fmtKES(l.insurance),
          total_repayable: fmtKES(l.total_repayable),
          amount_paid: fmtKES(l.amount_paid),
          balance: fmtKES(l.balance),
        }));
      case "savings":
        return data.savings.map((s: any) => ({
          ...s,
          entry_date: fmtDate(s.entry_date),
          member_name: s.member?.full_name ?? "—",
          member_no: s.member?.membership_no ?? "—",
          amount: fmtKES(s.amount),
          balance: fmtKES(s.balance),
        }));
      case "collections": {
        const sheetMap = new Map(data.sheets.map((s: any) => [s.id, s]));
        return data.entries.map((e: any) => {
          const sheet: any = sheetMap.get(e.collection_id) ?? {};
          return {
            week_number: sheet.week_number ?? "",
            collection_date: fmtDate(sheet.collection_date),
            member_name: e.member?.full_name ?? "—",
            member_no: e.member?.membership_no ?? "—",
            contribution: fmtKES(e.contribution),
            loan_repayment: fmtKES(e.loan_repayment),
            penalty: fmtKES(e.penalty),
            total: fmtKES(Number(e.contribution || 0) + Number(e.loan_repayment || 0) + Number(e.penalty || 0)),
          };
        });
      }
      case "fines": {
        // Aggregate by member from fines table
        const byMember = new Map<string, { name: string; no: string; charged: number; paid: number }>();
        for (const f of data.fines as any[]) {
          const loan: any = (data.loans as any[]).find((l: any) => l.id === f.loan_id);
          if (!loan) continue;
          const m: any = loan.member;
          const key = loan.member_id;
          const cur = byMember.get(key) ?? { name: m?.full_name ?? "—", no: m?.membership_no ?? "—", charged: 0, paid: 0 };
          cur.charged += Number(f.amount || 0);
          cur.paid += Number(f.amount_paid || 0);
          byMember.set(key, cur);
        }
        return Array.from(byMember.values()).map(v => ({
          member_name: v.name, member_no: v.no,
          total_charged: fmtKES(v.charged), total_paid: fmtKES(v.paid),
          outstanding: fmtKES(v.charged - v.paid),
        }));
      }
      default:
        return [];
    }
  };

  const summary = (() => {
    if (!data) return null;
    const totalBorrowed = data.loans.reduce((s: number, l: any) => s + Number(l.amount_borrowed || 0), 0);
    const totalBal = data.loans.reduce((s: number, l: any) => s + Number(l.balance || 0), 0);
    const totalPaid = data.loans.reduce((s: number, l: any) => s + Number(l.amount_paid || 0), 0);
    const latestByMember = new Map<string, number>();
    for (const e of data.savings) {
      const cur = latestByMember.get(e.member_id);
      if (cur == null || e.entry_date > (latestByMember as any).__d?.[e.member_id]) {
        latestByMember.set(e.member_id, Number(e.balance));
      }
    }
    const totalSavings = Array.from(latestByMember.values()).reduce((a, b) => a + b, 0);
    const totalFinesCharged = data.loans.reduce((s: number, l: any) => s + Number(l.total_fines_charged || 0), 0);
    const totalFinesPaid = data.loans.reduce((s: number, l: any) => s + Number(l.total_fines_paid || 0), 0);
    const totalOutstandingFines = data.loans.reduce((s: number, l: any) => s + Number(l.outstanding_fines || 0), 0);
    return {
      members: data.members.length,
      active: data.members.filter((m: any) => m.is_active).length,
      loansCount: data.loans.length,
      pending: data.loans.filter((l: any) => l.status === "pending").length,
      active_loans: data.loans.filter((l: any) => ["active", "approved", "overdue"].includes(l.status)).length,
      totalBorrowed, totalBal, totalPaid, totalSavings,
      totalFinesCharged, totalFinesPaid, totalOutstandingFines,
      sheets: data.sheets.length,
    };
  })();

  const reports: { key: ReportKey; label: string; description: string; icon: any }[] = [
    { key: "summary", label: "Summary Report", description: "Overall financial snapshot", icon: BarChart3 },
    { key: "members", label: "Members Roster", description: "Complete member directory", icon: Users },
    { key: "loans", label: "Loan Register", description: "All loans with balances & status", icon: Banknote },
    { key: "fines", label: "Fine Summary", description: "Fines per member: charged / paid / outstanding", icon: Banknote },
    { key: "savings", label: "Savings Ledger", description: "All savings transactions", icon: PiggyBank },
    { key: "collections", label: "Weekly Collections", description: "All collection sheet entries", icon: ClipboardList },
  ];

  const stamp = () => new Date().toISOString().slice(0, 10);

  const handle = (kind: "csv" | "xlsx" | "pdf", r: ReportKey) => {
    if (!data) { toast.error("Data not loaded yet"); return; }
    if (r === "summary") {
      if (!summary) return;
      const rows = [
        { metric: "Total Members", value: String(summary.members) },
        { metric: "Active Members", value: String(summary.active) },
        { metric: "Total Loans on File", value: String(summary.loansCount) },
        { metric: "Pending Approval", value: String(summary.pending) },
        { metric: "Active/Approved Loans", value: String(summary.active_loans) },
        { metric: "Total Borrowed", value: fmtKES(summary.totalBorrowed) },
        { metric: "Total Repaid", value: fmtKES(summary.totalPaid) },
        { metric: "Outstanding Balance", value: fmtKES(summary.totalBal) },
        { metric: "Total Fines Charged", value: fmtKES(summary.totalFinesCharged) },
        { metric: "Total Fines Paid", value: fmtKES(summary.totalFinesPaid) },
        { metric: "Outstanding Fines", value: fmtKES(summary.totalOutstandingFines) },
        { metric: "Total Member Savings", value: fmtKES(summary.totalSavings) },
        { metric: "Collection Sheets", value: String(summary.sheets) },
      ];
      const cols: Column[] = [{ header: "Metric", key: "metric", width: 28 }, { header: "Value", key: "value", width: 20, align: "right" }];
      if (kind === "csv") exportCSV(`ekb-summary-${stamp()}.csv`, cols, rows);
      else if (kind === "xlsx") exportXLSX(`ekb-summary-${stamp()}.xlsx`, [{ name: "Summary", columns: cols, rows }]);
      else exportPDF(`ekb-summary-${stamp()}.pdf`, "Summary Report", [{ columns: cols, rows }], { subtitle: "Financial snapshot" });
      toast.success("Export ready");
      return;
    }
    const cols = buildColumns(r);
    const rows = buildRows(r);
    const label = reports.find(x => x.key === r)?.label ?? r;
    const fname = `ekb-${r}-${stamp()}.${kind}`;
    if (kind === "csv") exportCSV(fname, cols, rows);
    else if (kind === "xlsx") exportXLSX(fname, [{ name: label, columns: cols, rows }]);
    else exportPDF(fname, label, [{ columns: cols, rows }], { subtitle: `${rows.length} records` });
    toast.success("Export ready");
  };

  const exportAll = (kind: "xlsx" | "pdf") => {
    if (!data) return;
    if (kind === "xlsx") {
      exportXLSX(`ekb-full-report-${stamp()}.xlsx`, [
        { name: "Members", columns: buildColumns("members"), rows: buildRows("members") },
        { name: "Loans", columns: buildColumns("loans"), rows: buildRows("loans") },
        { name: "Fines", columns: buildColumns("fines"), rows: buildRows("fines") },
        { name: "Savings", columns: buildColumns("savings"), rows: buildRows("savings") },
        { name: "Collections", columns: buildColumns("collections"), rows: buildRows("collections") },
      ]);
    } else {
      exportPDF(`ekb-full-report-${stamp()}.pdf`, "Full Report", [
        { heading: "Members", columns: buildColumns("members"), rows: buildRows("members") },
        { heading: "Loans", columns: buildColumns("loans"), rows: buildRows("loans") },
        { heading: "Fines", columns: buildColumns("fines"), rows: buildRows("fines") },
        { heading: "Savings", columns: buildColumns("savings"), rows: buildRows("savings") },
        { heading: "Collections", columns: buildColumns("collections"), rows: buildRows("collections") },
      ], { subtitle: "All modules" });
    }
    toast.success("Full report ready");
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="Financial summaries & exports"
        actions={<div className="flex gap-2">
          <Button variant="outline" onClick={() => exportAll("xlsx")} disabled={isLoading}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Full Excel
          </Button>
          <Button className="bg-navy text-white hover:bg-navy-2" onClick={() => exportAll("pdf")} disabled={isLoading}>
            <FileText className="w-4 h-4 mr-2" /> Full PDF
          </Button>
        </div>} />

      {isLoading && <Card className="p-8 text-center text-muted-foreground">Loading report data…</Card>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map(({ key, label, description, icon: Icon }) => (
          <Card key={key} className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gold/15 text-gold flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif font-bold">{label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => handle("csv", key)} disabled={isLoading}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => handle("xlsx", key)} disabled={isLoading}>
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Excel
              </Button>
              <Button size="sm" className="bg-navy text-white hover:bg-navy-2" onClick={() => handle("pdf", key)} disabled={isLoading}>
                <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

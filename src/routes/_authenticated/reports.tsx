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

type ReportKey = "summary" | "members" | "loans" | "savings" | "collections" | "fines" | "opening" | "benevolent";

function ReportsPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = role === "super_admin" || role === "admin" || role === "auditor";

  const { data, isLoading } = useQuery({
    queryKey: ["reports-bundle"],
    enabled: allowed,
    queryFn: async () => {
      const [profs, roles, loans, sched, repay, savings, sheets, entries, fines, openings, loanOpenings, benevolentEntries] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, membership_no, is_active, date_joined"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("loans").select("*"),
        (supabase.from("loan_schedule" as any) as any).select("*"),
        supabase.from("loan_repayments").select("*"),
        supabase.from("passbook_entries").select("*"),
        (supabase.from("weekly_collections" as any) as any).select("*"),
        (supabase.from("weekly_collection_entries" as any) as any).select("*"),
        (supabase.from("loan_fines" as any) as any).select("*"),
        (supabase.from("member_opening_balances" as any) as any).select("*"),
        (supabase.from("loan_opening_balances" as any) as any).select("*"),
        (supabase.from("benevolent_entries" as any) as any).select("*")
      ]);
      const roleMap = new Map((roles.data ?? []).map((r: any) => [r.user_id, r.role]));
      const memberMap = new Map((profs.data ?? []).map((p: any) => [p.id, p]));
      return {
        members: (profs.data ?? []).filter((p: any) => (roleMap.get(p.id) ?? "member") === "member").map((p: any) => ({ ...p, role: "member" })),
        loans: (loans.data ?? []).map((l: any) => ({ ...l, member: memberMap.get(l.member_id) })),
        schedule: sched.data ?? [],
        repayments: repay.data ?? [],
        savings: (savings.data ?? []).map((s: any) => ({ ...s, member: memberMap.get(s.member_id) })),
        sheets: sheets.data ?? [],
        entries: (entries.data ?? []).map((e: any) => ({ ...e, member: memberMap.get(e.member_id) })),
        fines: fines.data ?? [],
        openings: (openings.data ?? []).map((o: any) => ({ ...o, member: memberMap.get(o.member_id) })),
        loanOpenings: (loanOpenings.data ?? []).map((o: any) => ({ ...o, member: memberMap.get(o.member_id) })),
        benevolentEntries: (benevolentEntries.data ?? []).map((b: any) => ({ ...b, member: memberMap.get(b.member_id) })),
        memberMap,
      };
    },
  });

  useEffect(() => { if (!loading && role && !allowed) navigate({ to: "/dashboard" }); }, [loading, role, allowed, navigate]);
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
          { header: "Type", key: "loan_type", width: 10 },
          { header: "Principal", key: "principal", align: "right", width: 12 },
          { header: "Total Repay", key: "total_repayable", align: "right", width: 13 },
          { header: "Paid", key: "amount_paid", align: "right", width: 12 },
          { header: "Outstanding", key: "outstanding_balance", align: "right", width: 12 },
          { header: "Status", key: "status", width: 10 },
        ];
      case "savings":
        return [
          { header: "Member", key: "member_name", width: 28 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Total Deposits", key: "total_deposits", align: "right", width: 14 },
          { header: "Total Withdrawals", key: "total_withdrawals", align: "right", width: 14 },
          { header: "Current Balance", key: "current_balance", align: "right", width: 14 },
        ];
      case "collections":
        return [
          { header: "Week", key: "week_number", width: 8 },
          { header: "Date", key: "collection_date", width: 12 },
          { header: "Total Members", key: "total_members", width: 10 },
          { header: "Total Savings", key: "total_savings", align: "right", width: 14 },
          { header: "Total Loan Repayments", key: "total_loan_repayments", align: "right", width: 14 },
          { header: "Total Benevolent", key: "total_benevolent", align: "right", width: 14 },
          { header: "Total Fines", key: "total_fines", align: "right", width: 12 },
          { header: "Grand Total", key: "grand_total", align: "right", width: 14 },
        ];
      case "benevolent":
        return [
          { header: "Member", key: "member_name", width: 28 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Total Contributions", key: "total_contributions", align: "right", width: 14 },
          { header: "Total Withdrawals", key: "total_withdrawals", align: "right", width: 14 },
          { header: "Current Balance", key: "current_balance", align: "right", width: 14 },
        ];
      case "fines":
        return [
          { header: "Member", key: "member_name", width: 24 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Total Charged", key: "total_charged", align: "right", width: 14 },
          { header: "Total Paid", key: "total_paid", align: "right", width: 14 },
          { header: "Outstanding", key: "outstanding", align: "right", width: 14 },
        ];
      case "opening":
        return [
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Member", key: "member_name", width: 24 },
          { header: "Effective Date", key: "effective_date", width: 14 },
          { header: "Savings B/F", key: "opening_savings", align: "right", width: 14 },
          { header: "Loan B/F", key: "opening_loan", align: "right", width: 14 },
          { header: "Fine B/F", key: "opening_fine", align: "right", width: 12 },
          { header: "Insurance B/F", key: "opening_insurance", align: "right", width: 14 },
          { header: "Benevolent B/F", key: "opening_benevolent", align: "right", width: 14 },
          { header: "Notes", key: "notes", width: 28 },
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
      case "loans": {
        const rows: any[] = [];
        for (const l of data.loans as any[]) {
          const principal = Number(l.amount_borrowed ?? 0);
          const totalRepayable = Number(l.total_repayable ?? 0);
          const amountPaid = Number(l.amount_paid ?? 0);
          const outstanding = Number(l.balance ?? Math.max(0, totalRepayable - amountPaid));
          rows.push({ loan_date: fmtDate(l.loan_date), member_name: l.member?.full_name ?? "—", member_no: l.member?.membership_no ?? "—", loan_type: "Regular", principal: fmtKES(principal), total_repayable: fmtKES(totalRepayable), amount_paid: fmtKES(amountPaid), outstanding_balance: fmtKES(outstanding), status: l.status ?? "" });
        }
        for (const o of data.loanOpenings as any[]) {
          const principal = Number(o.balance ?? 0);
          const totalRepayable = Number(o.total_repayable ?? 0);
          const amountPaid = Number(o.amount_paid ?? 0);
          const outstanding = Number(o.balance ?? Math.max(0, totalRepayable - amountPaid));
          rows.push({ loan_date: fmtDate(o.loan_date ?? o.effective_date), member_name: o.member?.full_name ?? "—", member_no: o.member?.membership_no ?? "—", loan_type: "Opening", principal: fmtKES(principal), total_repayable: fmtKES(totalRepayable), amount_paid: fmtKES(amountPaid), outstanding_balance: fmtKES(outstanding), status: o.status ?? "" });
        }
        return rows;
      }
      case "savings": {
        const rows: any[] = [];
        for (const m of data.members as any[]) {
          const memberEntries = (data.savings as any[]).filter((e: any) => e.member_id === m.id);
          const totalDeposits = memberEntries.reduce((s: number, e: any) => s + Number(e.savings ?? 0) + Number(e.bonus ?? 0), 0);
          const totalWithdrawals = memberEntries.reduce((s: number, e: any) => s + Number(e.withdrawal ?? 0), 0);
          let currentBalance = 0;
          if (memberEntries.length > 0) {
            const latest = memberEntries.reduce((a, b) => (a.entry_date > b.entry_date ? a : b));
            currentBalance = Number(latest.balance ?? 0);
          } else {
            const opening = (data.openings as any[]).find((o: any) => o.member_id === m.id);
            currentBalance = opening ? Number(opening.opening_savings ?? 0) : 0;
          }
          rows.push({ member_name: m.full_name ?? "—", member_no: m.membership_no ?? "—", total_deposits: fmtKES(totalDeposits), total_withdrawals: fmtKES(totalWithdrawals), current_balance: fmtKES(currentBalance) });
        }
        return rows;
      }
      case "collections": {
        const rows: any[] = [];
        for (const s of data.sheets as any[]) {
          const sheetEntries = (data.entries as any[]).filter((e: any) => e.collection_id === s.id);
          const totalMembers = new Set(sheetEntries.map((e: any) => e.member_id)).size;
          const totalSavings = sheetEntries.reduce((t: number, e: any) => t + Number(e.savings ?? 0), 0);
          const totalLoanRepay = sheetEntries.reduce((t: number, e: any) => t + Number(e.loan_refund ?? 0), 0);
          const totalBenevolent = sheetEntries.reduce((t: number, e: any) => t + Number(e.benevolent_fund ?? 0), 0);
          const totalFines = sheetEntries.reduce((t: number, e: any) => t + Number(e.fine ?? 0), 0);
          const grandTotal = totalSavings + totalLoanRepay + totalBenevolent + totalFines;
          rows.push({ week_number: s.week_number ?? "", collection_date: fmtDate(s.collection_date), total_members: totalMembers, total_savings: fmtKES(totalSavings), total_loan_repayments: fmtKES(totalLoanRepay), total_benevolent: fmtKES(totalBenevolent), total_fines: fmtKES(totalFines), grand_total: fmtKES(grandTotal) });
        }
        return rows;
      }
      case "fines": {
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
        // Include opening loan fines if present
        for (const o of data.loanOpenings as any[]) {
          const key = o.member_id;
          const m: any = o.member;
          const cur = byMember.get(key) ?? { name: m?.full_name ?? "—", no: m?.membership_no ?? "—", charged: 0, paid: 0 };
          cur.charged += Number(o.total_fines_charged ?? o.opening_fine ?? 0);
          cur.paid += Number(o.total_fines_paid ?? o.opening_fine_paid ?? 0);
          byMember.set(key, cur);
        }
        return Array.from(byMember.values()).map(v => ({ member_name: v.name, member_no: v.no, total_charged: fmtKES(v.charged), total_paid: fmtKES(v.paid), outstanding: fmtKES(v.charged - v.paid) }));
      }
      case "benevolent": {
        // Aggregate benevolent_entries per member
        const byMember = new Map<string, { name: string; no: string; contrib: number; withdraw: number; balance: number }>();
        for (const b of data.benevolentEntries as any[]) {
          const key = b.member_id;
          const m: any = b.member;
          const cur = byMember.get(key) ?? { name: m?.full_name ?? "—", no: m?.membership_no ?? "—", contrib: 0, withdraw: 0, balance: 0 };
          cur.contrib += Number(b.contribution ?? 0);
          cur.withdraw += Number(b.withdrawal ?? 0);
          cur.balance = Number(b.balance ?? cur.balance);
          byMember.set(key, cur);
        }
        return Array.from(byMember.values()).map(v => ({ member_name: v.name, member_no: v.no, total_contributions: fmtKES(v.contrib), total_withdrawals: fmtKES(v.withdraw), current_balance: fmtKES(v.balance) }));
      }
      case "opening":
        return (data.openings as any[]).map((o: any) => ({
          member_name: o.member?.full_name ?? "—",
          member_no: o.member?.membership_no ?? "—",
          effective_date: fmtDate(o.effective_date),
          opening_savings: fmtKES(o.opening_savings),
          opening_loan: fmtKES(o.opening_loan),
          opening_fine: fmtKES(o.opening_fine),
          opening_insurance: fmtKES(o.opening_insurance),
          opening_benevolent: fmtKES(o.opening_benevolent),
          notes: o.notes ?? "",
        }));
      default:
        return [];
    }
  };

  const summary = (() => {
    if (!data) return null;
    const totalBorrowed = data.loans.reduce((s: number, l: any) => s + Number(l.amount_borrowed || 0), 0);
    const openingLoanTotal = (data.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_loan || 0), 0);
    const openingSavingsTotal = (data.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_savings || 0), 0);
    const openingFineTotal = (data.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_fine || 0), 0);
    const openingInsuranceTotal = (data.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_insurance || 0), 0);
    const openingBenevolentTotal = (data.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_benevolent || 0), 0);
    const totalBal = data.loans.reduce((s: number, l: any) => s + Number(l.balance || 0), 0) + openingLoanTotal;
    const totalPaid = data.loans.reduce((s: number, l: any) => s + Number(l.amount_paid || 0), 0);
    const latestByMember = new Map<string, number>();
    const latestDate = new Map<string, string>();
    for (const e of data.savings) {
      const prev = latestDate.get(e.member_id);
      if (!prev || e.entry_date > prev) {
        latestByMember.set(e.member_id, Number(e.balance));
        latestDate.set(e.member_id, e.entry_date);
      }
    }
    let totalSavings = Array.from(latestByMember.values()).reduce((a, b) => a + b, 0);
    for (const o of data.openings as any[]) {
      if (!latestByMember.has(o.member_id)) totalSavings += Number(o.opening_savings || 0);
    }
    const totalFinesCharged = data.loans.reduce((s: number, l: any) => s + Number(l.total_fines_charged || 0), 0);
    const totalFinesPaid = data.loans.reduce((s: number, l: any) => s + Number(l.total_fines_paid || 0), 0);
    const totalOutstandingFines = data.loans.reduce((s: number, l: any) => s + Number(l.outstanding_fines || 0), 0) + openingFineTotal;
    return {
      members: data.members.length,
      active: data.members.filter((m: any) => m.is_active).length,
      loansCount: data.loans.length,
      pending: data.loans.filter((l: any) => l.status === "pending").length,
      active_loans: data.loans.filter((l: any) => ["active", "approved", "overdue"].includes(l.status)).length,
      totalBorrowed, totalBal, totalPaid, totalSavings,
      totalFinesCharged, totalFinesPaid, totalOutstandingFines,
      openingLoanTotal, openingSavingsTotal, openingFineTotal, openingInsuranceTotal, openingBenevolentTotal,
      sheets: data.sheets.length,
    };
  })();

  const reports: { key: ReportKey; label: string; description: string; icon: any }[] = [
    { key: "summary", label: "Summary Report", description: "Overall financial snapshot", icon: BarChart3 },
    { key: "members", label: "Members Roster", description: "Complete member directory", icon: Users },
    { key: "opening", label: "Opening Balances", description: "Brought-forward balances per member (savings, loan, fine, insurance, benevolent)", icon: BarChart3 },
    { key: "loans", label: "Loan Register", description: "All loans with balances & status", icon: Banknote },
    { key: "fines", label: "Fine Summary", description: "Fines per member: charged / paid / outstanding", icon: Banknote },
    { key: "benevolent", label: "Benevolent Fund", description: "Contributions, withdrawals, balances per member", icon: PiggyBank },
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
        { metric: "— Brought Forward Totals —", value: "" },
        { metric: "Opening Savings (B/F)", value: fmtKES(summary.openingSavingsTotal) },
        { metric: "Opening Loans (B/F)", value: fmtKES(summary.openingLoanTotal) },
        { metric: "Opening Fines (B/F)", value: fmtKES(summary.openingFineTotal) },
        { metric: "Opening Insurance (B/F)", value: fmtKES(summary.openingInsuranceTotal) },
        { metric: "Opening Benevolent Fund (B/F)", value: fmtKES(summary.openingBenevolentTotal) },
        { metric: "— Current Period —", value: "" },
        { metric: "Total Loans on File", value: String(summary.loansCount) },
        { metric: "Pending Approval", value: String(summary.pending) },
        { metric: "Active/Approved Loans", value: String(summary.active_loans) },
        { metric: "Total Borrowed", value: fmtKES(summary.totalBorrowed) },
        { metric: "Total Repaid", value: fmtKES(summary.totalPaid) },
        { metric: "Outstanding Balance (incl. B/F)", value: fmtKES(summary.totalBal) },
        { metric: "Total Fines Charged", value: fmtKES(summary.totalFinesCharged) },
        { metric: "Total Fines Paid", value: fmtKES(summary.totalFinesPaid) },
        { metric: "Outstanding Fines (incl. B/F)", value: fmtKES(summary.totalOutstandingFines) },
        { metric: "Total Member Savings (incl. B/F)", value: fmtKES(summary.totalSavings) },
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
        { name: "Opening Balances", columns: buildColumns("opening"), rows: buildRows("opening") },
        { name: "Loans", columns: buildColumns("loans"), rows: buildRows("loans") },
        { name: "Benevolent", columns: buildColumns("benevolent"), rows: buildRows("benevolent") },
        { name: "Fines", columns: buildColumns("fines"), rows: buildRows("fines") },
        { name: "Savings", columns: buildColumns("savings"), rows: buildRows("savings") },
        { name: "Collections", columns: buildColumns("collections"), rows: buildRows("collections") },
      ]);
    } else {
      exportPDF(`ekb-full-report-${stamp()}.pdf`, "Full Report", [
        { heading: "Members", columns: buildColumns("members"), rows: buildRows("members") },
        { heading: "Opening Balances (Brought Forward)", columns: buildColumns("opening"), rows: buildRows("opening") },
        { heading: "Loans", columns: buildColumns("loans"), rows: buildRows("loans") },
        { heading: "Benevolent Fund", columns: buildColumns("benevolent"), rows: buildRows("benevolent") },
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

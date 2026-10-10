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
import { PageSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — EKB" }] }),
});

type ReportKey = "summary" | "members" | "loans" | "savings" | "collections" | "fines" | "opening" | "benevolent" | "annual";

function ReportsPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = role === "super_admin" || role === "admin" || role === "auditor";

  const [annualYear, setAnnualYear] = useState(new Date().getFullYear());
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["reports-bundle"],
    enabled: allowed,
    queryFn: async () => {
      const [profs, roles, loans, sched, repay, savings, sheets, entries, fines, openings, loanOpenings, benevolentEntries, insurancePayments] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, membership_no, is_active, date_joined"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("loans").select("*"),
        (supabase.from("loan_schedule" as any) as any).select("*"),
        supabase.from("loan_repayments").select("*"),
        supabase.from("savings_entries").select("*").order("member_id").order("entry_date", { ascending: true }).order("created_at", { ascending: true }),
        (supabase.from("weekly_collections" as any) as any).select("*").order("collection_date", { ascending: true }),
        (supabase.from("weekly_collection_entries" as any) as any).select("*"),
        (supabase.from("loan_fines" as any) as any).select("*"),
        (supabase.from("member_opening_balances" as any) as any).select("*"),
        (supabase.from("loan_opening_balances" as any) as any).select("*"),
        (supabase.from("benevolent_entries" as any) as any).select("*").order("member_id").order("entry_date", { ascending: true }).order("created_at", { ascending: true }),
        (supabase.from("loan_insurance_payments" as any) as any).select("*")
      ]);
      const errors = [profs, roles, loans, sched, repay, savings, sheets, entries, fines, openings, loanOpenings, benevolentEntries, insurancePayments]
        .map((result: any) => result.error)
        .filter(Boolean);
      if (errors.length) throw errors[0];
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
        insurancePayments: insurancePayments.data ?? [],
        memberMap,
      };
    },
  });

  useEffect(() => { if (!loading && role && !allowed) navigate({ to: "/dashboard" }); }, [loading, role, allowed, navigate]);
  if (loading || !role) return <PageSkeleton />;
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
          { header: "Date", key: "entry_date", width: 12 },
          { header: "Member", key: "member_name", width: 28 },
          { header: "Member ID", key: "member_no", width: 12 },
          { header: "Savings", key: "amount", align: "right", width: 14 },
          { header: "Bonus", key: "bonus", align: "right", width: 12 },
          { header: "Withdrawal", key: "withdrawal", align: "right", width: 14 },
          { header: "Running Balance", key: "balance", align: "right", width: 14 },
          { header: "Notes", key: "notes", width: 24 },
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
          { header: "Total Insurance", key: "total_insurance", align: "right", width: 14 },
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

  const buildRows = (key: ReportKey, reportData: any = data): any[] => {
    if (!reportData) return [];
    const source = reportData;
    switch (key) {
      case "members":
        return source.members.map((m: any) => ({
          ...m,
          is_active_str: m.is_active ? "Yes" : "No",
          joined_str: fmtDate(m.date_joined),
        }));
      case "loans": {
        const rows: any[] = [];
        for (const l of source.loans as any[]) {
          const principal = Number(l.amount_borrowed ?? 0);
          const totalRepayable = Number(l.total_repayable ?? 0);
          const amountPaid = Number(l.amount_paid ?? 0);
          const outstanding = Number(l.balance ?? 0);
          rows.push({ loan_date: fmtDate(l.loan_date), member_name: l.member?.full_name ?? "—", member_no: l.member?.membership_no ?? "—", loan_type: "Regular", principal: fmtKES(principal), total_repayable: fmtKES(totalRepayable), amount_paid: fmtKES(amountPaid), outstanding_balance: fmtKES(outstanding), status: l.status ?? "" });
        }
        for (const o of source.loanOpenings as any[]) {
          const principal = Number(o.principal ?? 0) || Number(o.total_repayable ?? 0);
          const totalRepayable = Number(o.total_repayable ?? 0);
          const amountPaid = Number(o.amount_paid ?? 0);
          const outstanding = Number(o.balance ?? 0);
          rows.push({ loan_date: fmtDate(o.loan_date ?? o.effective_date), member_name: o.member?.full_name ?? "—", member_no: o.member?.membership_no ?? "—", loan_type: "Opening B/F", principal: fmtKES(principal), total_repayable: fmtKES(totalRepayable), amount_paid: fmtKES(amountPaid), outstanding_balance: fmtKES(outstanding), status: o.status ?? (outstanding > 0 ? "active" : "completed") });
        }
        return rows;
      }
      case "savings": {
        const rows: any[] = (source.savings as any[]).map((entry: any) => ({
          entry_date: fmtDate(entry.entry_date),
          member_name: entry.member?.full_name ?? "—",
          member_no: entry.member?.membership_no ?? "—",
          amount: fmtKES(entry.amount),
          bonus: fmtKES(entry.bonus),
          withdrawal: fmtKES(entry.withdrawal),
          balance: fmtKES(entry.balance),
          notes: entry.notes ?? "",
          sort_member: entry.member?.membership_no ?? entry.member_id,
          sort_date: `${entry.entry_date}-${entry.created_at ?? ""}`,
        })).sort((a: any, b: any) => String(a.sort_member).localeCompare(String(b.sort_member)) || String(a.sort_date).localeCompare(String(b.sort_date)));
        for (const opening of source.openings as any[]) {
          if (!(source.savings as any[]).some((entry: any) => entry.member_id === opening.member_id)) {
            const member = source.members.find((item: any) => item.id === opening.member_id);
            rows.push({
              entry_date: fmtDate(opening.effective_date), member_name: member?.full_name ?? "—", member_no: member?.membership_no ?? "—",
              amount: fmtKES(0), bonus: fmtKES(0), withdrawal: fmtKES(0), balance: fmtKES(opening.opening_savings), notes: "Opening B/F",
              sort_member: member?.membership_no ?? opening.member_id, sort_date: opening.effective_date ?? "",
            });
          }
        }
        return rows.sort((a: any, b: any) => String(a.sort_member).localeCompare(String(b.sort_member)) || String(a.sort_date).localeCompare(String(b.sort_date)));
      }
      case "collections": {
        const rows: any[] = [];
        for (const s of [...source.sheets].sort((a: any, b: any) => String(a.collection_date).localeCompare(String(b.collection_date)))) {
          const sheetEntries = (source.entries as any[]).filter((e: any) => e.collection_id === s.id);
          const totalMembers = new Set(sheetEntries.map((e: any) => e.member_id)).size;
          const totalSavings = sheetEntries.reduce((t: number, e: any) => t + Number(e.savings ?? 0), 0);
          const totalLoanRepay = sheetEntries.reduce((t: number, e: any) => t + Number(e.loan_refund ?? 0), 0);
          const totalBenevolent = sheetEntries.reduce((t: number, e: any) => t + Number(e.benevolent_fund ?? 0), 0);
          const totalFines = sheetEntries.reduce((t: number, e: any) => t + Number(e.fine ?? 0), 0);
          const totalInsurance = sheetEntries.reduce((t: number, e: any) => t + Number(e.insurance ?? 0), 0);
          const grandTotal = totalSavings + totalLoanRepay + totalBenevolent + totalFines + totalInsurance;
          rows.push({ week_number: s.week_number ?? "", collection_date: fmtDate(s.collection_date), total_members: totalMembers, total_savings: fmtKES(totalSavings), total_loan_repayments: fmtKES(totalLoanRepay), total_benevolent: fmtKES(totalBenevolent), total_fines: fmtKES(totalFines), total_insurance: fmtKES(totalInsurance), grand_total: fmtKES(grandTotal) });
        }
        return rows;
      }
      case "fines": {
        const byMember = new Map<string, { name: string; no: string; charged: number; paid: number }>();
        for (const f of source.fines as any[]) {
          const loan: any = (source.loans as any[]).find((l: any) => l.id === f.loan_id);
          if (!loan) continue;
          const m: any = loan.member;
          const key = loan.member_id;
          const cur = byMember.get(key) ?? { name: m?.full_name ?? "—", no: m?.membership_no ?? "—", charged: 0, paid: 0 };
          cur.charged += Number(f.amount || 0);
          cur.paid += Number(f.amount_paid || 0);
          byMember.set(key, cur);
        }
        return Array.from(byMember.values()).map(v => ({ member_name: v.name, member_no: v.no, total_charged: fmtKES(v.charged), total_paid: fmtKES(v.paid), outstanding: fmtKES(Math.max(0, v.charged - v.paid)) }));
      }
      case "benevolent": {
        // Aggregate benevolent_entries per member
        const byMember = new Map<string, { name: string; no: string; contrib: number; withdraw: number; balance: number }>();
        for (const b of source.benevolentEntries as any[]) {
          const key = b.member_id;
          const m: any = b.member;
          const cur = byMember.get(key) ?? { name: m?.full_name ?? "—", no: m?.membership_no ?? "—", contrib: 0, withdraw: 0, balance: 0 };
          cur.contrib += Number(b.contribution ?? 0);
          cur.withdraw += Number(b.withdrawal ?? 0);
          cur.balance = Number(b.balance ?? cur.balance);
          byMember.set(key, cur);
        }
        for (const m of source.members as any[]) {
          if (!byMember.has(m.id)) {
            const opening = (source.openings as any[]).find((o: any) => o.member_id === m.id);
            byMember.set(m.id, { name: m.full_name ?? "—", no: m.membership_no ?? "—", contrib: 0, withdraw: 0, balance: Number(opening?.opening_benevolent ?? 0) });
          }
        }
        return Array.from(byMember.values()).map(v => ({ member_name: v.name, member_no: v.no, total_contributions: fmtKES(v.contrib), total_withdrawals: fmtKES(v.withdraw), current_balance: fmtKES(v.balance) }));
      }
      case "opening":
        return (source.openings as any[]).map((o: any) => ({
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

  const summaryFor = (reportData: any) => {
    if (!reportData) return null;
    const openingLoanTotal = (reportData.loanOpenings as any[]).reduce((s: number, o: any) => s + Number(o.balance || 0), 0);
    const openingSavingsTotal = (reportData.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_savings || 0), 0);
    const openingFineTotal = (reportData.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_fine || 0), 0);
    const openingInsuranceTotal = (reportData.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_insurance || 0), 0);
    const openingBenevolentTotal = (reportData.openings as any[]).reduce((s: number, o: any) => s + Number(o.opening_benevolent || 0), 0);
    const totalBorrowed = reportData.loans.reduce((s: number, l: any) => s + Number(l.amount_borrowed || 0), 0);
    const totalBal = reportData.loans.reduce((s: number, l: any) => s + Number(l.balance || 0), 0) + openingLoanTotal;
    const totalPaid = reportData.repayments.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const latestByMember = new Map<string, number>();
    const latestDate = new Map<string, string>();
    for (const e of reportData.savings) {
      const prev = latestDate.get(e.member_id);
      const entryKey = `${e.entry_date}-${e.created_at ?? ""}`;
      if (!prev || entryKey > prev) {
        latestByMember.set(e.member_id, Number(e.balance));
        latestDate.set(e.member_id, entryKey);
      }
    }
    let totalSavings = Array.from(latestByMember.values()).reduce((a, b) => a + b, 0);
    for (const o of reportData.openings as any[]) {
      if (!latestByMember.has(o.member_id)) totalSavings += Number(o.opening_savings || 0);
    }
    const totalFinesCharged = reportData.fines.reduce((s: number, f: any) => s + Number(f.amount || 0), 0) + openingFineTotal;
    const totalFinesPaid = reportData.fines.reduce((s: number, f: any) => s + Number(f.amount_paid || 0), 0);
    const totalOutstandingFines = reportData.fines.reduce((s: number, f: any) => s + Math.max(0, Number(f.amount || 0) - Number(f.amount_paid || 0)), 0) + openingFineTotal;
    return {
      members: reportData.members.length,
      active: reportData.members.filter((m: any) => m.is_active).length,
      loansCount: reportData.loans.length + reportData.loanOpenings.length,
      pending: reportData.loans.filter((l: any) => l.status === "pending").length,
      active_loans: reportData.loans.filter((l: any) => ["active", "approved", "overdue"].includes(l.status)).length + reportData.loanOpenings.filter((l: any) => Number(l.balance) > 0).length,
      totalBorrowed, totalBal, totalPaid, totalSavings,
      totalFinesCharged, totalFinesPaid, totalOutstandingFines,
      openingLoanTotal, openingSavingsTotal, openingFineTotal, openingInsuranceTotal, openingBenevolentTotal,
      sheets: reportData.sheets.length,
    };
  };

  const annualReportFor = (reportData: any, year: number) => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const inYear = (date: string | null | undefined) => !!date && date >= yearStart && date <= yearEnd;
    const savings = reportData.savings.filter((entry: any) => inYear(entry.entry_date));
    const benevolent = reportData.benevolentEntries.filter((entry: any) => inYear(entry.entry_date));
    const repayments = reportData.repayments.filter((entry: any) => inYear(entry.payment_date));
    const insurance = reportData.insurancePayments.filter((entry: any) => inYear(entry.payment_date));
    const savingsCollected = savings.reduce((total: number, entry: any) => total + Number(entry.amount || 0) + Number(entry.bonus || 0), 0);
    const loanRepayments = repayments.reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0);
    const benevolentCollected = benevolent.reduce((total: number, entry: any) => total + Number(entry.contribution || 0), 0);
    const finesCollected = repayments.reduce((total: number, entry: any) => total + Number(entry.fine_paid || 0), 0);
    const insuranceCollected = insurance.reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0);
    const collectionsTotal = savingsCollected + loanRepayments + benevolentCollected + finesCollected + insuranceCollected;
    const loansIssued = reportData.loans.filter((loan: any) => inYear(loan.loan_date));
    const loanBookAtYearEnd = [...reportData.loans, ...reportData.loanOpenings].filter((loan: any) => !loan.loan_date || loan.loan_date <= yearEnd);
    const outstandingLoans = loanBookAtYearEnd.filter((loan: any) => Number(loan.balance || 0) > 0);
    const activeLoans = outstandingLoans.length;
    const clearedLoans = loanBookAtYearEnd.filter((loan: any) =>
      ["completed", "completed_with_fine"].includes(loan.status) || (Number(loan.total_repayable || 0) > 0 && Number(loan.balance || 0) <= 0)
    ).length;
    const loanBalance = outstandingLoans.reduce((total: number, loan: any) => total + Number(loan.balance || 0), 0);
    const latestBalances = (entries: any[], balanceField: string, openingField: string) => {
      const latest = new Map<string, any>();
      for (const entry of entries.filter((item: any) => !item.entry_date || item.entry_date <= yearEnd)) latest.set(entry.member_id, entry);
      const memberIds = new Set([...reportData.members.map((member: any) => member.id), ...reportData.openings.map((opening: any) => opening.member_id)]);
      let total = 0;
      for (const memberId of memberIds) {
        const entry = latest.get(memberId);
        const opening = reportData.openings.find((item: any) => item.member_id === memberId);
        total += Number(entry ? entry[balanceField] || 0 : opening?.[openingField] || 0);
      }
      return total;
    };
    const savingsBalance = latestBalances(reportData.savings, "balance", "opening_savings");
    const benevolentBalance = latestBalances(reportData.benevolentEntries, "balance", "opening_benevolent");
    const outstandingFines = reportData.fines.filter((fine: any) => !fine.fine_date || fine.fine_date <= yearEnd)
      .reduce((total: number, fine: any) => total + Math.max(0, Number(fine.amount || 0) - Number(fine.amount_paid || 0)), 0);
    const weeklySheets = reportData.sheets.filter((sheet: any) => inYear(sheet.collection_date))
      .sort((a: any, b: any) => String(a.collection_date).localeCompare(String(b.collection_date)));
    const weeklyRows: any[] = weeklySheets.map((sheet: any) => {
      const items = reportData.entries.filter((entry: any) => entry.collection_id === sheet.id);
      const sum = (key: string) => items.reduce((total: number, entry: any) => total + Number(entry[key] || 0), 0);
      return {
        week_number: sheet.week_number,
        collection_date: fmtDate(sheet.collection_date),
        total_members: new Set(items.map((entry: any) => entry.member_id)).size,
        total_savings: fmtKES(sum("savings")),
        total_loan_repayments: fmtKES(sum("loan_refund")),
        total_benevolent: fmtKES(sum("benevolent_fund")),
        total_fines: fmtKES(sum("fine")),
        grand_total: fmtKES(sum("savings") + sum("loan_refund") + sum("benevolent_fund") + sum("fine")),
      };
    });
    const weeklyTotals = weeklyRows.reduce((total: any, row: any) => {
      total.total_members += Number(row.total_members || 0);
      for (const key of ["total_savings", "total_loan_repayments", "total_benevolent", "total_fines", "grand_total"]) {
        total[key] += Number(String(row[key]).replace(/[^0-9.-]/g, "")) || 0;
      }
      return total;
    }, { total_members: 0, total_savings: 0, total_loan_repayments: 0, total_benevolent: 0, total_fines: 0, grand_total: 0 });
    weeklyRows.push({
      week_number: "TOTAL", collection_date: "", total_members: weeklyTotals.total_members,
      total_savings: fmtKES(weeklyTotals.total_savings), total_loan_repayments: fmtKES(weeklyTotals.total_loan_repayments),
      total_benevolent: fmtKES(weeklyTotals.total_benevolent), total_fines: fmtKES(weeklyTotals.total_fines), grand_total: fmtKES(weeklyTotals.grand_total),
    });
    const incomeColumns: Column[] = [{ header: "Metric", key: "metric", width: 34 }, { header: "Amount", key: "amount", align: "right", width: 20 }];
    const positionColumns: Column[] = [{ header: "Metric", key: "metric", width: 38 }, { header: "Value", key: "value", align: "right", width: 20 }];
    const weeklyColumns: Column[] = [
      { header: "Week No", key: "week_number", width: 10 },
      { header: "Date", key: "collection_date", width: 12 },
      { header: "Members Present", key: "total_members", width: 14 },
      { header: "Total Savings", key: "total_savings", align: "right", width: 14 },
      { header: "Total Loan Repayments", key: "total_loan_repayments", align: "right", width: 18 },
      { header: "Total Benevolent", key: "total_benevolent", align: "right", width: 14 },
      { header: "Total Fines", key: "total_fines", align: "right", width: 12 },
      { header: "Grand Total", key: "grand_total", align: "right", width: 14 },
    ];
    const incomeRows = [
      { metric: "Total savings collected", amount: fmtKES(savingsCollected) },
      { metric: "Total loan repayments received", amount: fmtKES(loanRepayments) },
      { metric: "Total benevolent fund contributions", amount: fmtKES(benevolentCollected) },
      { metric: "Total fines collected", amount: fmtKES(finesCollected) },
      { metric: "Total insurance collected", amount: fmtKES(insuranceCollected) },
      { metric: "Grand Total Collections for the year", amount: fmtKES(collectionsTotal) },
    ];
    const positionRows = [
      { metric: "Total loans issued during the year", value: fmtKES(loansIssued.reduce((total: number, loan: any) => total + Number(loan.total_repayable || 0), 0)) },
      { metric: "Total outstanding loan balance", value: fmtKES(loanBalance) },
      { metric: "Total amount repaid during the year", value: fmtKES(repayments.reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0)) },
      { metric: "Number of active loans", value: String(activeLoans) },
      { metric: "Number of cleared/completed loans", value: String(clearedLoans) },
    ];
    const fundRows = [
      { metric: "Total savings balance", value: fmtKES(savingsBalance) },
      { metric: "Total benevolent fund balance", value: fmtKES(benevolentBalance) },
      { metric: "Total outstanding fines", value: fmtKES(outstandingFines) },
      { metric: "Total outstanding loan balance", value: fmtKES(loanBalance) },
    ];
    const csvColumns: Column[] = [
      { header: "Section", key: "section", width: 28 }, { header: "Metric", key: "metric", width: 38 }, { header: "Value", key: "value", width: 20 },
      ...weeklyColumns.map(column => ({ ...column, key: `weekly_${column.key}` })),
    ];
    const csvRows = [
      ...incomeRows.map(row => ({ section: "Income & Collections Summary", metric: row.metric, value: row.amount })),
      ...positionRows.map(row => ({ section: "Loan Book Position", metric: row.metric, value: row.value })),
      ...fundRows.map(row => ({ section: "Fund Balances", metric: row.metric, value: row.value })),
      ...weeklyRows.map((row: any) => ({ section: "Weekly Collections Breakdown", ...Object.fromEntries(Object.entries(row).map(([key, value]) => [`weekly_${key}`, value])) })),
    ];
    return {
      sections: [
        { heading: "Income & Collections Summary", columns: incomeColumns, rows: incomeRows },
        { heading: "Loan Book Position", columns: positionColumns, rows: positionRows },
        { heading: "Fund Balances", columns: positionColumns, rows: fundRows },
        { heading: "Weekly Collections Breakdown", columns: weeklyColumns, rows: weeklyRows },
      ],
      csvColumns,
      csvRows,
    };
  };

  const reports: { key: ReportKey; label: string; description: string; icon: any }[] = [
    { key: "annual", label: "Annual Financial Summary", description: "Yearly collections, loan book, fund balances, and weekly breakdown", icon: BarChart3 },
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

  const refreshReportData = async () => {
    const result = await refetch();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Report data could not be loaded");
    return result.data;
  };

  const handle = async (kind: "csv" | "xlsx" | "pdf", r: ReportKey) => {
    let reportData: any;
    try {
      reportData = await refreshReportData();
    } catch (error: any) {
      toast.error(error.message ?? "Could not refresh report data");
      return;
    }
    if (r === "annual") {
      const annual = annualReportFor(reportData, annualYear);
      const filename = `ekb-annual-financial-summary-${annualYear}-${stamp()}.${kind}`;
      if (kind === "csv") exportCSV(filename, annual.csvColumns, annual.csvRows);
      else if (kind === "xlsx") exportXLSX(filename, annual.sections.map((section: any) => ({ name: section.heading, columns: section.columns, rows: section.rows })));
      else exportPDF(filename, "Annual Financial Summary", annual.sections, { subtitle: `Financial year ${annualYear}` });
      toast.success("Export ready");
      return;
    }
    if (r === "summary") {
      const currentSummary = summaryFor(reportData);
      if (!currentSummary) return;
      const rows = [
        { metric: "Total Members", value: String(currentSummary.members) },
        { metric: "Active Members", value: String(currentSummary.active) },
        { metric: "— Brought Forward Totals —", value: "" },
        { metric: "Opening Savings (B/F)", value: fmtKES(currentSummary.openingSavingsTotal) },
        { metric: "Opening Loans (B/F)", value: fmtKES(currentSummary.openingLoanTotal) },
        { metric: "Opening Fines (B/F)", value: fmtKES(currentSummary.openingFineTotal) },
        { metric: "Opening Insurance (B/F)", value: fmtKES(currentSummary.openingInsuranceTotal) },
        { metric: "Opening Benevolent Fund (B/F)", value: fmtKES(currentSummary.openingBenevolentTotal) },
        { metric: "— Current Period —", value: "" },
        { metric: "Total Loans on File", value: String(currentSummary.loansCount) },
        { metric: "Pending Approval", value: String(currentSummary.pending) },
        { metric: "Active/Approved Loans", value: String(currentSummary.active_loans) },
        { metric: "Total Borrowed", value: fmtKES(currentSummary.totalBorrowed) },
        { metric: "Total Repaid", value: fmtKES(currentSummary.totalPaid) },
        { metric: "Outstanding Balance (incl. B/F)", value: fmtKES(currentSummary.totalBal) },
        { metric: "Total Fines Charged", value: fmtKES(currentSummary.totalFinesCharged) },
        { metric: "Total Fines Paid", value: fmtKES(currentSummary.totalFinesPaid) },
        { metric: "Outstanding Fines (incl. B/F)", value: fmtKES(currentSummary.totalOutstandingFines) },
        { metric: "Total Member Savings (incl. B/F)", value: fmtKES(currentSummary.totalSavings) },
        { metric: "Collection Sheets", value: String(currentSummary.sheets) },
      ];
      const cols: Column[] = [{ header: "Metric", key: "metric", width: 28 }, { header: "Value", key: "value", width: 20, align: "right" }];
      if (kind === "csv") exportCSV(`ekb-summary-${stamp()}.csv`, cols, rows);
      else if (kind === "xlsx") exportXLSX(`ekb-summary-${stamp()}.xlsx`, [{ name: "Summary", columns: cols, rows }]);
      else exportPDF(`ekb-summary-${stamp()}.pdf`, "Summary Report", [{ columns: cols, rows }], { subtitle: "Financial snapshot" });
      toast.success("Export ready");
      return;
    }
    const cols = buildColumns(r);
    const rows = buildRows(r, reportData);
    const label = reports.find(x => x.key === r)?.label ?? r;
    const fname = `ekb-${r}-${stamp()}.${kind}`;
    if (kind === "csv") exportCSV(fname, cols, rows);
    else if (kind === "xlsx") exportXLSX(fname, [{ name: label, columns: cols, rows }]);
    else exportPDF(fname, label, [{ columns: cols, rows }], { subtitle: `${rows.length} records` });
    toast.success("Export ready");
  };

  const exportAll = async (kind: "xlsx" | "pdf") => {
    let reportData: any;
    try {
      reportData = await refreshReportData();
    } catch (error: any) {
      toast.error(error.message ?? "Could not refresh report data");
      return;
    }
    if (kind === "xlsx") {
      exportXLSX(`ekb-full-report-${stamp()}.xlsx`, [
        { name: "Members", columns: buildColumns("members"), rows: buildRows("members", reportData) },
        { name: "Opening Balances", columns: buildColumns("opening"), rows: buildRows("opening", reportData) },
        { name: "Loans", columns: buildColumns("loans"), rows: buildRows("loans", reportData) },
        { name: "Benevolent", columns: buildColumns("benevolent"), rows: buildRows("benevolent", reportData) },
        { name: "Fines", columns: buildColumns("fines"), rows: buildRows("fines", reportData) },
        { name: "Savings", columns: buildColumns("savings"), rows: buildRows("savings", reportData) },
        { name: "Collections", columns: buildColumns("collections"), rows: buildRows("collections", reportData) },
      ]);
    } else {
      exportPDF(`ekb-full-report-${stamp()}.pdf`, "Full Report", [
        { heading: "Members", columns: buildColumns("members"), rows: buildRows("members", reportData) },
        { heading: "Opening Balances (Brought Forward)", columns: buildColumns("opening"), rows: buildRows("opening", reportData) },
        { heading: "Loans", columns: buildColumns("loans"), rows: buildRows("loans", reportData) },
        { heading: "Benevolent Fund", columns: buildColumns("benevolent"), rows: buildRows("benevolent", reportData) },
        { heading: "Fines", columns: buildColumns("fines"), rows: buildRows("fines", reportData) },
        { heading: "Savings", columns: buildColumns("savings"), rows: buildRows("savings", reportData) },
        { heading: "Collections", columns: buildColumns("collections"), rows: buildRows("collections", reportData) },
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
            {key === "annual" && (
              <div className="mb-4 flex items-center gap-2">
                <label htmlFor="annual-report-year" className="text-sm font-medium">Financial year</label>
                <select
                  id="annual-report-year"
                  aria-label="Annual report year"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={annualYear}
                  onChange={event => setAnnualYear(Number(event.target.value))}
                  disabled={isLoading}
                >
                  {[0, 1, 2].map(offset => {
                    const year = new Date().getFullYear() - offset;
                    return <option key={year} value={year}>{year}</option>;
                  })}
                </select>
              </div>
            )}
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

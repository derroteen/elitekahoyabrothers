import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <div>
      <PageHeader title="Reports" subtitle="Financial summaries & exports" />
      <Card className="p-8 text-center text-muted-foreground">
        PDF & Excel exports come in Phase 3.
      </Card>
    </div>
  ),
  head: () => ({ meta: [{ title: "Reports — EKB" }] }),
});

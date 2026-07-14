import { Skeleton } from "@/components/ui/skeleton";

/** Full page skeleton: header bar + several content rows. */
export function PageSkeleton() {
  return (
    <div className="p-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton rows for a table body. */
export function TableRowsSkeleton({
  rows = 5,
  cols,
  cellClassName = "px-3 py-3",
}: {
  rows?: number;
  cols: number;
  cellClassName?: string;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-border">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={cellClassName}>
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Inline skeleton lines for smaller components. */
export function InlineSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

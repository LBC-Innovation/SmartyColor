"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Tailwind width class for the header, e.g. "w-32". */
  width?: string;
  /** Hide the column below this breakpoint. */
  hideBelow?: "md" | "lg" | "xl";
  /** Shown in the totals footer. */
  footer?: ReactNode;
};

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

type Sort = { key: string; dir: "asc" | "desc" };

/**
 * A real <table>: sortable headers with aria-sort, numbers right-aligned, an optional totals row.
 * Clickable rows: the first cell's content is wrapped in a button that stretches over the whole row,
 * so the row works with a mouse, Enter/Space and screen readers alike.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  rowLabel,
  selectedKey,
  loading,
  empty,
  defaultSort,
  mobileCard,
  showFooter,
  className,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Screen-reader caption. */
  caption: string;
  onRowClick?: (row: T) => void;
  /** Accessible name of the row button, e.g. "Open order 3F2A91C0". */
  rowLabel?: (row: T) => string;
  selectedKey?: string | null;
  loading?: boolean;
  empty?: ReactNode;
  defaultSort?: Sort;
  /** Phones get a card list instead of the table when given. */
  mobileCard?: (row: T) => ReactNode;
  showFooter?: boolean;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState<Sort | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  function toggle(key: string) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  const showEmpty = !loading && rows.length === 0;

  return (
    <div className={cn("v2-panel overflow-hidden", className)}>
      {mobileCard ? (
        <ul className="divide-y divide-gray-100 md:hidden">
          {loading && rows.length === 0
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="px-4 py-4">
                  <div className="h-3 w-2/3 rounded bg-gray-100 motion-safe:animate-pulse" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-gray-100 motion-safe:animate-pulse" />
                </li>
              ))
            : sorted.map((row) => (
                <li key={rowKey(row)}>
                  {onRowClick ? (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      aria-label={rowLabel?.(row)}
                      className="block w-full px-4 py-3 text-left transition hover:bg-v2-bg-subtle/60"
                    >
                      {mobileCard(row)}
                    </button>
                  ) : (
                    <div className="px-4 py-3">{mobileCard(row)}</div>
                  )}
                </li>
              ))}
          {showEmpty ? <li>{empty}</li> : null}
        </ul>
      ) : null}
      <div className={cn("overflow-x-auto", mobileCard && "hidden md:block")}>
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-[1] bg-v2-bg-subtle">
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : col.sortValue ? "none" : undefined;
                const Icon = active ? (sort.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      "h-10 whitespace-nowrap px-4 text-xs font-semibold text-v2-muted",
                      col.align === "right" ? "text-right" : "text-left",
                      col.width,
                      col.hideBelow && HIDE[col.hideBelow],
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggle(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded hover:text-v2-ink",
                          col.align === "right" && "flex-row-reverse",
                          active && "text-v2-ink",
                        )}
                      >
                        {col.header}
                        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} aria-hidden />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="h-12 border-t border-gray-100">
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-4", col.hideBelow && HIDE[col.hideBelow])}>
                        <div className="h-3 rounded bg-gray-100 motion-safe:animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((row) => {
                  const key = rowKey(row);
                  const selected = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      className={cn(
                        "relative h-12 border-t border-gray-100 align-middle text-v2-navy transition-colors",
                        onRowClick && "cursor-pointer hover:bg-v2-bg-subtle/60",
                        selected && "bg-v2-primary-light/60",
                        rowClassName?.(row),
                      )}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((col, i) => (
                        <td
                          key={col.key}
                          className={cn(
                            "px-4 py-2.5",
                            col.align === "right" && "text-right tabular-nums",
                            col.hideBelow && HIDE[col.hideBelow],
                          )}
                        >
                          {i === 0 && onRowClick ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRowClick(row);
                              }}
                              aria-label={rowLabel?.(row)}
                              className="block w-full text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-v2-primary"
                            >
                              {col.cell(row)}
                            </button>
                          ) : (
                            col.cell(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            {showEmpty ? (
              <tr className="border-t border-gray-100">
                <td colSpan={columns.length}>{empty}</td>
              </tr>
            ) : null}
          </tbody>
          {showFooter && rows.length > 0 ? (
            <tfoot>
              <tr className="h-11 border-t border-gray-200 font-semibold text-v2-ink">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4", col.align === "right" && "text-right tabular-nums", col.hideBelow && HIDE[col.hideBelow])}
                  >
                    {col.footer}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

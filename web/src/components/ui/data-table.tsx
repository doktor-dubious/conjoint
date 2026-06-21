import * as React from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Focus,
  Search,
  Star,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  hint?: React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null;
  render: (row: T) => React.ReactNode;
  className?: string;
  headClassName?: string;
};

type Id = string | number;

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  getSearchText,
  activeId = null,
  onRowClick,
  itemsPerPage = 10,
  searchPlaceholder = "Filter…",
  emptyText = "No rows.",
  loading = false,
  enableSelect = true,
  enableStar = true,
  hideCount = false,
  initialSortKey = null,
  initialSortDir = "asc",
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => Id;
  getSearchText: (row: T) => string;
  activeId?: Id | null;
  onRowClick?: (row: T) => void;
  itemsPerPage?: number;
  searchPlaceholder?: string;
  emptyText?: React.ReactNode;
  loading?: boolean;
  enableSelect?: boolean;
  enableStar?: boolean;
  hideCount?: boolean;
  initialSortKey?: string | null;
  initialSortDir?: "asc" | "desc";
}) {
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(initialSortKey);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">(initialSortDir);
  const [page, setPage] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<Set<Id>>(new Set());
  const [starredIds, setStarredIds] = React.useState<Set<Id>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = React.useState(false);

  const STAR_KEY = "__star";

  const filtered = React.useMemo(() => {
    let items = showOnlySelected
      ? rows.filter((r) => selectedIds.has(getRowId(r)))
      : rows;

    const q = search.trim().toLowerCase();
    if (q) items = items.filter((r) => getSearchText(r).toLowerCase().includes(q));

    if (!sortKey) return items;
    const col = columns.find((c) => c.key === sortKey);
    return [...items].sort((a, b) => {
      let cmp: number;
      if (sortKey === STAR_KEY) {
        cmp =
          (starredIds.has(getRowId(a)) ? 1 : 0) -
          (starredIds.has(getRowId(b)) ? 1 : 0);
      } else {
        const av = col?.sortValue ? col.sortValue(a) : null;
        const bv = col?.sortValue ? col.sortValue(b) : null;
        if (av === null && bv === null) cmp = 0;
        else if (av === null) return 1;
        else if (bv === null) return -1;
        else cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    rows,
    showOnlySelected,
    selectedIds,
    search,
    sortKey,
    sortDir,
    starredIds,
    columns,
    getRowId,
    getSearchText,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );

  const colCount =
    columns.length + (enableSelect ? 1 : 0) + (enableStar ? 1 : 0);

  function sortBy(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleSelect(idv: Id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(idv) ? next.delete(idv) : next.add(idv);
      return next;
    });
  }
  function toggleStar(idv: Id) {
    setStarredIds((prev) => {
      const next = new Set(prev);
      next.has(idv) ? next.delete(idv) : next.add(idv);
      return next;
    });
  }

  const pageIds = pageItems.map(getRowId);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((i) => selectedIds.has(i));
  const somePageSelected = pageIds.some((i) => selectedIds.has(i));

  function headerCheckbox() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((i) => next.delete(i));
      else pageIds.forEach((i) => next.add(i));
      return next;
    });
  }

  const selectedCount = selectedIds.size;

  const SortBtn = ({ k, label }: { k: string; label: React.ReactNode }) => {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => sortBy(k)}
        className="flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        {!hideCount && (
          <span className="mr-auto text-xs text-muted-foreground">
            {filtered.length} row{filtered.length === 1 ? "" : "s"}
            {showOnlySelected && " (selected only)"}
          </span>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 w-52 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {enableSelect && (
                <TableHead className="w-12 pl-4">
                  <div className="flex items-center gap-0.5">
                    <Checkbox
                      checked={
                        allPageSelected
                          ? true
                          : somePageSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={headerCheckbox}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex h-5 w-4 items-center justify-center transition-colors hover:text-foreground"
                          aria-label="Selection options"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() =>
                            setSelectedIds(new Set(filtered.map(getRowId)))
                          }
                        >
                          Select all
                        </DropdownMenuItem>
                        {enableStar && (
                          <DropdownMenuItem
                            onClick={() =>
                              setSelectedIds(
                                new Set(
                                  rows
                                    .filter((r) => starredIds.has(getRowId(r)))
                                    .map(getRowId),
                                ),
                              )
                            }
                          >
                            Select starred
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setSelectedIds(new Set())}>
                          Clear selection
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
              )}

              {columns.map((c) => (
                <TableHead key={c.key} className={c.headClassName}>
                  <div className="flex items-center gap-1">
                    {c.sortable ? (
                      <SortBtn k={c.key} label={c.header} />
                    ) : (
                      <span className="font-medium">{c.header}</span>
                    )}
                    {c.hint && <InfoHint text={c.hint} />}
                  </div>
                </TableHead>
              ))}

              {enableStar && (
                <TableHead className="w-10 text-center">
                  <button
                    type="button"
                    onClick={() => sortBy(STAR_KEY)}
                    className="mx-auto flex items-center gap-1 transition-colors hover:text-foreground"
                    title="Sort by starred"
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        sortKey === STAR_KEY ? "" : "opacity-40",
                      )}
                    />
                    {sortKey === STAR_KEY &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="h-20 text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="h-20 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((row) => {
                const idv = getRowId(row);
                return (
                  <TableRow
                    key={idv}
                    data-state={activeId === idv ? "selected" : undefined}
                    onClick={() => {
                      if (onRowClick) onRowClick(row);
                      else if (enableSelect) toggleSelect(idv);
                    }}
                    onContextMenu={
                      enableStar
                        ? (e) => {
                            e.preventDefault();
                            toggleStar(idv);
                          }
                        : undefined
                    }
                    className={cn(
                      (onRowClick || enableSelect) && "cursor-pointer",
                    )}
                  >
                    {enableSelect && (
                      <TableCell
                        className="pl-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(idv)}
                          onCheckedChange={() => toggleSelect(idv)}
                        />
                      </TableCell>
                    )}
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {c.render(row)}
                      </TableCell>
                    ))}
                    {enableStar && (
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => toggleStar(idv)}
                          className="transition-colors hover:text-amber-400"
                          aria-label="Toggle star"
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              starredIds.has(idv)
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground",
                            )}
                          />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {(safePage - 1) * itemsPerPage + 1}–
            {Math.min(safePage * itemsPerPage, filtered.length)} of{" "}
            {filtered.length}
          </span>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  />
                </PaginationItem>
                {buildPaginationPages(safePage, totalPages).map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`e${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={safePage === p}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      {/* Selected area */}
      {enableSelect && selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {selectedCount} of {rows.length} selected
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowOnlySelected((v) => !v)}
              title={showOnlySelected ? "Show all" : "Show only selected"}
            >
              <Focus
                className={cn("h-4 w-4", showOnlySelected && "text-primary")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setSelectedIds(new Set());
                setShowOnlySelected(false);
              }}
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPaginationPages(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (
    let p = Math.max(2, current - 1);
    p <= Math.min(total - 1, current + 1);
    p++
  )
    pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

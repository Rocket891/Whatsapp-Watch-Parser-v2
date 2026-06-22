import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2, Sparkles, RotateCcw, Search, X } from "lucide-react";

import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { WatchCard } from "@/components/tiers/WatchCard";
import { TierRow } from "@/components/tiers/TierRow";
import { TIER_ORDER, TIER_COLORS, tierTextColor } from "@/components/tiers/tierConfig";
import type { Tier, TierModel } from "@/components/tiers/tierConfig";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/** A watch model as returned by the public catalog endpoint. */
interface CatalogModel {
  ref: string;
  name: string;
  collection: string;
  imageUrl: string;
  hasImage: boolean;
}

/** The persisted shape of a saved custom list. */
interface BoardData {
  /** refs placed into each rated tier */
  tiers: Record<string, string[]>;
  /** refs not yet placed (the "Unranked" tray) */
  pool: string[];
}

/** A saved-list summary row from GET /api/custom-tiers. */
interface SavedListSummary {
  id: string;
  name: string;
  updatedAt: string;
}

/** GET /api/custom-tiers/:id detail. */
interface SavedListDetail {
  id: string;
  name: string;
  data: BoardData;
}

/** Special key for the unranked tray drop target. */
const POOL_KEY = "__pool__";

/** Build a fresh, empty per-tier map. */
function emptyTiers(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of TIER_ORDER) out[t] = [];
  return out;
}

/** Normalise possibly-partial persisted data into a complete board. */
function normaliseBoard(data: Partial<BoardData> | undefined | null): BoardData {
  const tiers = emptyTiers();
  if (data?.tiers) {
    for (const t of TIER_ORDER) {
      const refs = data.tiers[t];
      if (Array.isArray(refs)) tiers[t] = [...refs];
    }
  }
  const pool = Array.isArray(data?.pool) ? [...(data!.pool as string[])] : [];
  return { tiers, pool };
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function CustomTiers() {
  const { toast } = useToast();

  /* ---- Data: the catalog of placeable watches (public) ---- */
  const {
    data: catalogData,
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery<{ models: CatalogModel[] }>({
    queryKey: ["/api/demand-tiers/models"],
  });

  /* ---- Data: this user's saved lists ---- */
  const { data: savedLists, isLoading: listsLoading } = useQuery<SavedListSummary[]>({
    queryKey: ["/api/custom-tiers"],
  });

  const catalog = catalogData?.models ?? [];

  /** ref -> model lookup for rendering cards. */
  const modelByRef = useMemo(() => {
    const m = new Map<string, CatalogModel>();
    for (const model of catalog) m.set(model.ref, model);
    return m;
  }, [catalog]);

  /* ---- Working board state (controlled, immutable updates) ---- */
  const [board, setBoard] = useState<BoardData>(() => ({ tiers: emptyTiers(), pool: [] }));
  const [listName, setListName] = useState("");
  /** id of the currently-loaded saved list, or null for an unsaved/new board. */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [selectValue, setSelectValue] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  /** ref currently being dragged (for visual hint); also passed via dataTransfer. */
  const [dragRef, setDragRef] = useState<string | null>(null);
  /** drop target currently hovered (tier key or POOL_KEY). */
  const [dragOver, setDragOver] = useState<string | null>(null);

  /* ---- Seed a blank board with every catalog ref in the pool once loaded ---- */
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || loadedId !== null || catalog.length === 0) return;
    // First time the catalog arrives and nothing is loaded: drop everything into the tray.
    setBoard((prev) => {
      const placed = new Set<string>([
        ...prev.pool,
        ...TIER_ORDER.flatMap((t) => prev.tiers[t]),
      ]);
      if (placed.size > 0) return prev; // user already interacting — don't clobber
      return { tiers: emptyTiers(), pool: catalog.map((m) => m.ref) };
    });
    setSeeded(true);
  }, [catalog, seeded, loadedId]);

  /* ---------------------------------------------------------------- */
  /* Board mutations                                                  */
  /* ---------------------------------------------------------------- */

  /** Remove a ref from wherever it currently lives, then append to the target. */
  function moveRef(ref: string, target: string) {
    setBoard((prev) => {
      const next: BoardData = {
        tiers: { ...prev.tiers },
        pool: prev.pool.filter((r) => r !== ref),
      };
      for (const t of TIER_ORDER) {
        next.tiers[t] = prev.tiers[t].filter((r) => r !== ref);
      }
      if (target === POOL_KEY) {
        next.pool = [...next.pool, ref];
      } else {
        next.tiers[target] = [...next.tiers[target], ref];
      }
      return next;
    });
    setDirty(true);
  }

  function handleDrop(target: string, e: React.DragEvent) {
    e.preventDefault();
    const ref = e.dataTransfer.getData("text/plain") || dragRef;
    setDragOver(null);
    setDragRef(null);
    if (!ref || !modelByRef.has(ref)) return;
    moveRef(ref, target);
  }

  function handleDragStart(ref: string, e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", ref);
    e.dataTransfer.effectAllowed = "move";
    setDragRef(ref);
  }

  /* ---------------------------------------------------------------- */
  /* List controls                                                    */
  /* ---------------------------------------------------------------- */

  function newBoard() {
    setBoard({ tiers: emptyTiers(), pool: catalog.map((m) => m.ref) });
    setLoadedId(null);
    setSelectValue("");
    setListName("");
    setDirty(false);
  }

  async function loadList(id: string) {
    try {
      const res = await apiRequest("GET", `/api/custom-tiers/${id}`);
      const detail: SavedListDetail = await res.json();
      setBoard(normaliseBoard(detail.data));
      setLoadedId(detail.id);
      setSelectValue(detail.id);
      setListName(detail.name ?? "");
      setDirty(false);
    } catch (err) {
      toast({
        title: "Couldn't load that list",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function saveList() {
    const name = listName.trim();
    if (!name) {
      toast({
        title: "Name your list first",
        description: "Give this tier list a name before saving.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (loadedId) {
        await apiRequest("PUT", `/api/custom-tiers/${loadedId}`, {
          name,
          data: board,
        });
      } else {
        const res = await apiRequest("POST", "/api/custom-tiers", {
          name,
          data: board,
        });
        const created: { id: string } = await res.json();
        setLoadedId(created.id);
        setSelectValue(created.id);
      }
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tiers"] });
      toast({ title: "Saved", description: `"${name}" is safe and sound.` });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteList() {
    if (!loadedId) return;
    const ok = window.confirm(
      `Delete "${listName || "this list"}"? This can't be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await apiRequest("DELETE", `/api/custom-tiers/${loadedId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tiers"] });
      toast({ title: "Deleted", description: `"${listName}" was removed.` });
      newBoard();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  /** Send every placed watch back to the unranked tray (keeps the same name/list). */
  function resetPlacements() {
    setBoard((prev) => {
      const all = [
        ...prev.pool,
        ...TIER_ORDER.flatMap((t) => prev.tiers[t]),
      ];
      // de-dupe while preserving order
      const seen = new Set<string>();
      const pool: string[] = [];
      for (const r of all) {
        if (!seen.has(r)) {
          seen.add(r);
          pool.push(r);
        }
      }
      return { tiers: emptyTiers(), pool };
    });
    setDirty(true);
  }

  /* ---------------------------------------------------------------- */
  /* Derived: filtered pool for the tray + add/search box             */
  /* ---------------------------------------------------------------- */

  const poolModels = useMemo(
    () =>
      board.pool
        .map((ref) => modelByRef.get(ref))
        .filter((m): m is CatalogModel => Boolean(m)),
    [board.pool, modelByRef]
  );

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return poolModels;
    return poolModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.ref.toLowerCase().includes(q) ||
        (m.collection ?? "").toLowerCase().includes(q)
    );
  }, [poolModels, search]);

  const totalPlaced = useMemo(
    () => TIER_ORDER.reduce((sum, t) => sum + board.tiers[t].length, 0),
    [board.tiers]
  );

  /* ---------------------------------------------------------------- */
  /* Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  /** A draggable compact card for a given ref (skips unknown refs). */
  function renderCard(ref: string) {
    const model = modelByRef.get(ref);
    if (!model) return null;
    const isDragging = dragRef === ref;
    return (
      <WatchCard
        key={ref}
        model={model as Pick<TierModel, "ref" | "name" | "imageUrl"> & Partial<TierModel>}
        variant="compact"
        draggable
        data-ref={ref}
        onDragStart={(e) => handleDragStart(ref, e)}
        onDragEnd={() => {
          setDragRef(null);
          setDragOver(null);
        }}
        className={
          "cursor-grab active:cursor-grabbing select-none" +
          (isDragging ? " opacity-40 ring-2 ring-primary" : "")
        }
      />
    );
  }

  /** Shared drag-over props for any drop zone, with a hover highlight. */
  function dropZoneProps(key: string) {
    return {
      "data-tier": key,
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(key);
      },
      onDragLeave: (e: React.DragEvent) => {
        // only clear if leaving the zone itself (not bubbling from a child)
        if (e.currentTarget === e.target) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => handleDrop(key, e),
      className:
        "transition-colors rounded-xl" +
        (dragOver === key ? " bg-primary/10 ring-2 ring-primary/40" : ""),
    };
  }

  /* ---------------------------------------------------------------- */
  /* JSX                                                              */
  /* ---------------------------------------------------------------- */

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--gradient-background)", fontFamily: "var(--font-primary)" }}
    >
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <Topbar
          title="My Tier Lists"
          subtitle="Drag watches into your own tiers"
        />

        <div className="p-6 space-y-6" style={{ background: "var(--gradient-background)" }}>
          {/* ---- Intro / badge strip ---- */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              className="gap-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              My List
            </Badge>
            <p className="text-sm text-muted-foreground">
              Arrange by feel — saved separately from the live market tiers.
            </p>
          </div>

          {/* ---- Controls bar ---- */}
          <div className="rounded-2xl border bg-card/80 backdrop-blur shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Saved-list picker */}
              <div className="min-w-[200px] flex-1 sm:flex-none sm:w-64">
                <Select
                  value={selectValue}
                  onValueChange={(id) => loadList(id)}
                  disabled={listsLoading || (savedLists?.length ?? 0) === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        listsLoading
                          ? "Loading lists…"
                          : (savedLists?.length ?? 0) === 0
                          ? "No saved lists yet"
                          : "Open a saved list…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(savedLists ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* New */}
              <Button variant="outline" onClick={newBoard} className="gap-1.5">
                <Plus className="h-4 w-4" />
                New
              </Button>

              {/* Name */}
              <Input
                value={listName}
                onChange={(e) => {
                  setListName(e.target.value);
                  setDirty(true);
                }}
                placeholder="Name your tier list…"
                className="min-w-[180px] flex-1 sm:flex-none sm:w-56"
              />

              {/* Save */}
              <Button onClick={saveList} disabled={saving} className="gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : loadedId ? "Save" : "Save new"}
              </Button>

              {/* Reset placements */}
              <Button
                variant="ghost"
                onClick={resetPlacements}
                className="gap-1.5"
                title="Move every watch back to the unranked tray"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>

              {/* Delete (only when a saved list is loaded) */}
              {loadedId && (
                <Button
                  variant="destructive"
                  onClick={deleteList}
                  disabled={deleting}
                  className="gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              )}

              {/* Dirty indicator */}
              {dirty && (
                <span className="ml-auto text-xs font-medium text-amber-600">
                  • Unsaved changes
                </span>
              )}
            </div>
          </div>

          {/* ---- Loading / error states for the catalog ---- */}
          {catalogLoading && (
            <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground shadow-sm">
              Loading the watch catalog…
            </div>
          )}
          {catalogError && !catalogLoading && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-700 shadow-sm">
              Couldn't load the watch catalog. Please refresh and try again.
            </div>
          )}

          {!catalogLoading && !catalogError && (
            <>
              {/* ---- Tier rows (drop zones) ---- */}
              <div className="space-y-3">
                {TIER_ORDER.map((tier: Tier) => {
                  const refs = board.tiers[tier];
                  return (
                    <TierRow
                      key={tier}
                      tier={tier}
                      count={refs.length}
                      containerProps={dropZoneProps(tier)}
                    >
                      {refs.length === 0 ? (
                        <div className="flex w-full items-center justify-center py-6 text-xs font-medium text-muted-foreground/70">
                          Drop watches here
                        </div>
                      ) : (
                        refs.map((ref) => renderCard(ref))
                      )}
                    </TierRow>
                  );
                })}
              </div>

              {/* ---- Unranked tray (drop zone backed by pool) ---- */}
              <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-extrabold"
                      style={{
                        backgroundColor: TIER_COLORS["?"],
                        color: tierTextColor("?"),
                      }}
                    >
                      Unranked
                    </span>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {poolModels.length} waiting · {totalPlaced} placed
                    </span>
                  </div>

                  {/* Search/add box */}
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Find a watch in the tray…"
                      className="pl-8 pr-8"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {(() => {
                  const poolProps = dropZoneProps(POOL_KEY);
                  return (
                <div
                  {...poolProps}
                  className={
                    "flex min-h-[140px] flex-wrap content-start items-start gap-3 p-4 " +
                    poolProps.className
                  }
                >
                  {poolModels.length === 0 ? (
                    <div className="flex w-full items-center justify-center py-8 text-sm font-medium text-muted-foreground/70">
                      Everything's been ranked — drag a card back here to unplace it.
                    </div>
                  ) : filteredPool.length === 0 ? (
                    <div className="flex w-full items-center justify-center py-8 text-sm font-medium text-muted-foreground/70">
                      No tray watches match "{search}".
                    </div>
                  ) : (
                    filteredPool.map((m) => renderCard(m.ref))
                  )}
                </div>
                  );
                })()}
              </div>

              {/* Empty-catalog hint */}
              {catalog.length === 0 && (
                <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground shadow-sm">
                  No watches available in the catalog yet.
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

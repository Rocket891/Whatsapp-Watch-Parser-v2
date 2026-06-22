import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Activity, Info, TrendingUp } from "lucide-react";
import { TierRow } from "@/components/tiers/TierRow";
import { WatchCard } from "@/components/tiers/WatchCard";
import { CustomBoard } from "@/components/tiers/CustomBoard";
import {
  TIER_ORDER,
  type DemandTiersPublicResponse,
  type TierModel,
} from "@/components/tiers/tierConfig";

export default function DemandTiers() {
  // Empty string = "use whatever quarter the server returns by default".
  const [quarter, setQuarter] = useState<string>("");
  // The "?" (no-MRP) bucket can be large; collapse it by default.
  const [showAllUnrated, setShowAllUnrated] = useState(false);

  const queryKey = quarter
    ? `/api/demand-tiers/public?quarter=${encodeURIComponent(quarter)}`
    : `/api/demand-tiers/public`;

  const { data, isLoading, isError, isFetching } =
    useQuery<DemandTiersPublicResponse>({
      // Default queryFn (queryClient.ts) fetches queryKey[0] as the URL and
      // returns res.json(). These public endpoints need no special handling.
      queryKey: [queryKey],
    });

  // Group models by tier once per data change.
  const byTier = useMemo(() => {
    const map = new Map<string, TierModel[]>();
    for (const m of data?.models ?? []) {
      const arr = map.get(m.tier) ?? [];
      arr.push(m);
      map.set(m.tier, arr);
    }
    return map;
  }, [data]);

  const unrated = byTier.get("?") ?? [];
  const totalModels = data?.models?.length ?? 0;
  const activeQuarter = data?.quarter ?? quarter;
  const quartersAvailable = data?.quartersAvailable ?? [];

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background: "var(--gradient-background)",
        fontFamily: "var(--font-primary)",
      }}
    >
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <Topbar
          title="Demand Tiers"
          subtitle="Rolex market premium vs retail"
        />

        <div
          className="p-6 space-y-6"
          style={{ background: "var(--gradient-background)" }}
        >
          <Tabs defaultValue="live" className="space-y-6">
            <TabsList className="inline-flex h-11 items-center gap-1 rounded-full bg-muted/70 p-1 backdrop-blur">
              <TabsTrigger
                value="live"
                className="rounded-full px-5 py-1.5 text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Live Market
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="rounded-full px-5 py-1.5 text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                My Lists
              </TabsTrigger>
            </TabsList>

            {/* ---- Tab: Live Market ---- */}
            <TabsContent value="live" className="mt-0 space-y-6">
          {/* Gradient header card */}
          <Card className="overflow-hidden rounded-2xl border-0 shadow-md">
            <div
              className="relative p-6 text-white"
              style={{
                background:
                  "linear-gradient(135deg, #6d28d9 0%, #4f46e5 50%, #2563eb 100%)",
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-6 w-6" />
                    <h1 className="text-2xl font-bold tracking-tight">
                      Demand Tiers
                    </h1>
                    <Badge className="ml-1 gap-1 border-white/30 bg-white/20 text-white hover:bg-white/30">
                      <Activity className="h-3 w-3" />
                      Live
                    </Badge>
                  </div>
                  <p className="max-w-2xl text-sm text-white/90">
                    Real dealer-market medians. Premium = market price vs
                    official retail (MRP).
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    {activeQuarter && (
                      <span className="rounded-full bg-white/15 px-3 py-1 font-medium">
                        Quarter: {activeQuarter}
                      </span>
                    )}
                    <span className="rounded-full bg-white/15 px-3 py-1 font-medium tabular-nums">
                      {totalModels} models
                    </span>
                    {data?.currency && (
                      <span className="rounded-full bg-white/15 px-3 py-1 font-medium">
                        {data.currency}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sticky quarter selector */}
                <div className="sticky top-4 self-start">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/80">
                    Quarter
                  </label>
                  <Select
                    value={activeQuarter || undefined}
                    onValueChange={(v) => setQuarter(v)}
                  >
                    <SelectTrigger className="w-44 border-white/30 bg-white/15 text-white backdrop-blur placeholder:text-white/70 focus:ring-white/40">
                      <SelectValue placeholder="Select quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      {quartersAvailable.length === 0 && activeQuarter && (
                        <SelectItem value={activeQuarter}>
                          {activeQuarter}
                        </SelectItem>
                      )}
                      {quartersAvailable.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-stretch gap-3 overflow-hidden rounded-2xl border bg-card p-0 shadow-sm"
                >
                  <Skeleton className="h-auto w-20 shrink-0 rounded-none sm:w-24" />
                  <div className="flex flex-1 flex-wrap gap-3 p-3">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <Skeleton key={j} className="h-44 w-40 rounded-2xl" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {isError && !isLoading && (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Info className="h-8 w-8 text-muted-foreground" />
                <p className="text-lg font-semibold">
                  Couldn&apos;t load demand tiers
                </p>
                <p className="text-sm text-muted-foreground">
                  Please try again in a moment or pick a different quarter.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!isLoading && !isError && totalModels === 0 && (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Info className="h-8 w-8 text-muted-foreground" />
                <p className="text-lg font-semibold">No models this quarter</p>
                <p className="text-sm text-muted-foreground">
                  There&apos;s no market data for {activeQuarter || "this period"}{" "}
                  yet.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tier board */}
          {!isLoading && !isError && totalModels > 0 && (
            <div
              className={`space-y-4 transition-opacity ${
                isFetching ? "opacity-60" : "opacity-100"
              }`}
            >
              {TIER_ORDER.map((tier) => {
                const models = byTier.get(tier) ?? [];
                return (
                  <TierRow key={tier} tier={tier} count={models.length}>
                    {models.map((m) => (
                      <WatchCard key={m.ref} model={m} variant="full" />
                    ))}
                  </TierRow>
                );
              })}

              {/* Unrated "?" — collapsed by default (can be hundreds) */}
              {unrated.length > 0 && (
                <div className="space-y-2">
                  <TierRow tier="?" count={unrated.length}>
                    {(showAllUnrated ? unrated : unrated.slice(0, 18)).map((m) => (
                      <WatchCard key={m.ref} model={m} variant="full" />
                    ))}
                  </TierRow>
                  <div className="pl-1">
                    {unrated.length > 18 && (
                      <button
                        onClick={() => setShowAllUnrated((s) => !s)}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {showAllUnrated
                          ? "Show fewer"
                          : `Show all ${unrated.length} unrated models`}
                      </button>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      “?” means no official retail (MRP) is on file yet, so a premium
                      can’t be computed. These are ranked once their MRP is added.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
            </TabsContent>

            {/* ---- Tab: My Lists ---- */}
            <TabsContent value="custom" className="mt-0">
              <CustomBoard />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

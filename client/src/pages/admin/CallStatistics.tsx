import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminCallStats } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Phone,
  AlertCircle,
  Ban,
  ShieldAlert,
  Hash,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Calendar,
} from 'lucide-react';

const REFRESH_INTERVAL_MS = 30_000; // refresh every 30s for "real time" feel

function formatThousands(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}`;
  return n.toLocaleString();
}

export default function CallStatistics() {
  const [days, setDays] = useState<number | undefined>(7);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin-call-stats', days],
    queryFn: () => getAdminCallStats(days),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Call Statistics</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    const message = error instanceof Error ? error.message : 'Failed to load call statistics.';
    const isConnection = /connection|server running|npm run dev/i.test(message);
    const isForbidden = /403|forbidden|authentication required|access denied|401/i.test(message);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Call Statistics</h1>
        <p className={isConnection ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
          {message}
        </p>
        {isForbidden && (
          <p className="text-sm text-muted-foreground">
            This page is only for <strong>admin</strong> accounts. Log in as an admin user to view call statistics.
          </p>
        )}
        {isConnection && (
          <p className="text-sm text-muted-foreground">
            In a terminal, run <code className="rounded bg-muted px-1 py-0.5">npm run dev</code> from the project root, then refresh this page.
          </p>
        )}
      </div>
    );
  }

  const {
    totalCallCount,
    totalFailures,
    failureRate,
    rateLimitErrorCount,
    contentModerationErrorCount,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    successCallCount,
    avgInputPerRequest,
    avgOutputPerRequest,
    totalCost,
    days: appliedDays,
  } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Call Statistics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance metrics from API usage logs. All API calls (LLM, TTS) are tracked with tokens, cost, and failures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-muted/30 p-1">
            {[undefined, 7, 30].map((d) => (
              <Button
                key={d ?? 'all'}
                variant={days === d ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d == null ? 'All' : `Last ${d}d`}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {appliedDays != null && (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          Showing data for the last {appliedDays} days. Auto-refreshes every 30s.
        </p>
      )}

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Metrics</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Call counts, failures, and token usage from your API usage log. Cost is computed from current pricing (env or International defaults).
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Calls */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Calls — Unit: calls
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Call Count</p>
                <p className="text-2xl font-bold mt-1">{totalCallCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Times</p>
              </div>
            </div>
          </div>

          {/* Failures */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Failures — Unit: calls
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Failures</p>
                <p className="text-2xl font-bold mt-1">{totalFailures.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Times</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Failure Rate (Average)</p>
                <p className="text-2xl font-bold mt-1">{failureRate.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">Rate</p>
              </div>
            </div>
          </div>

          {/* Rate Limit & Content Moderation */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Ban className="w-4 h-4" />
                Rate Limit Error Count — Unit: calls
              </h3>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-2xl font-bold">{rateLimitErrorCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Times</p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Content Moderation Error Count — Unit: calls
              </h3>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-2xl font-bold">{contentModerationErrorCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Times</p>
              </div>
            </div>
          </div>

          {/* Tokens */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Tokens — Unit: Tokens
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-2xl font-bold mt-1">
                  {totalTokens >= 1000 ? `${formatThousands(totalTokens)}K` : totalTokens.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Thousand Tokens</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Input Tokens</p>
                <p className="text-2xl font-bold mt-1">
                  {totalInputTokens >= 1000 ? `${formatThousands(totalInputTokens)}K` : totalInputTokens.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Thousand Tokens</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Output Tokens</p>
                <p className="text-2xl font-bold mt-1">
                  {totalOutputTokens >= 1000 ? `${formatThousands(totalOutputTokens)}K` : totalOutputTokens.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Thousand Tokens</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold mt-1">${totalCost.toFixed(4)}</p>
              </div>
            </div>
          </div>

          {/* Average usage per request */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Average Usage per Request — Unit: Tokens
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                <ArrowDownToLine className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Average Input</p>
                  <p className="text-xl font-bold">{avgInputPerRequest.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                  <p className="text-xs text-muted-foreground">Tokens</p>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                <ArrowUpFromLine className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Average Output</p>
                  <p className="text-xl font-bold">{avgOutputPerRequest.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                  <p className="text-xs text-muted-foreground">Tokens</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

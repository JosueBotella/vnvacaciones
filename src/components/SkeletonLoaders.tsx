import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Generic list item skeleton
export function SkeletonListItem() {
  return (
    <Card className="animate-pulse">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-3 w-[150px]" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

// Skeleton for worker/manager list
export function SkeletonWorkerList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="space-y-2 flex-1 min-w-0">
                  <Skeleton className="h-4 w-[180px] max-w-full" />
                  <Skeleton className="h-3 w-[120px] max-w-full" />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Skeleton for department cards grid
export function SkeletonDepartmentGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse overflow-hidden" style={{ animationDelay: `${i * 50}ms` }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-[140px]" />
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <Skeleton className="h-3 w-[100px] mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-9" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Skeleton for vacation request cards
export function SkeletonRequestList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse border-border/50" style={{ animationDelay: `${i * 75}ms` }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-[160px]" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-[100px]" />
                    <Skeleton className="h-3 w-[80px]" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-6 w-24 rounded-md" />
              ))}
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Skeleton for table rows
export function SkeletonTableRows({ columns = 4, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton 
              key={j} 
              className={`h-4 ${j === 0 ? 'w-[120px]' : j === columns - 1 ? 'w-[80px]' : 'flex-1'}`} 
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Skeleton for stats cards
export function SkeletonStatsCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-4 w-4 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-[60px] mb-1" />
            <Skeleton className="h-3 w-[80px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Skeleton for dashboard KPI cards
export function SkeletonDashboardKPI({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-card border border-border/40 p-4" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="flex items-center gap-2 mb-3">
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-[60px] mb-1" />
          <Skeleton className="h-3 w-[120px]" />
        </div>
      ))}
    </div>
  );
}

// Skeleton for charts
export function SkeletonChart() {
  return (
    <Card className="animate-pulse border-border/40 rounded-2xl">
      <CardContent className="p-4">
        <Skeleton className="h-4 w-[100px] mb-4" />
        <Skeleton className="h-[160px] w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

// Skeleton for action items list
export function SkeletonActionsList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-[140px] mb-2" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40" style={{ animationDelay: `${i * 50}ms` }}>
          <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-3 w-[140px]" />
          </div>
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

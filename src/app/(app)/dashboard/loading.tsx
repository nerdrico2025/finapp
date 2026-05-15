import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
          <Skeleton className="h-4 w-40 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-5">
          <Skeleton className="h-4 w-56 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex justify-between px-5 py-4 border-b border-gray-50">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0">
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <Skeleton className="h-4 w-36" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-gray-50 last:border-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                <Skeleton className="h-3.5 w-32 flex-1" />
                <Skeleton className="h-3.5 w-10 shrink-0" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

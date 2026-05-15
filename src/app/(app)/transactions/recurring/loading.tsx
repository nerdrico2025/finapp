import { Skeleton } from '@/components/ui/Skeleton'
export default function RecurringLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-32" /><Skeleton className="h-4 w-44" /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <Skeleton className="h-4 w-40" /><Skeleton className="h-7 w-16 rounded-lg" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0">
                <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-44" /></div>
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

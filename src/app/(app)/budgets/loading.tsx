import { Skeleton } from '@/components/ui/Skeleton'
export default function BudgetsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-28" /><Skeleton className="h-4 w-48" /></div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3 flex items-center justify-between">
        <Skeleton className="h-6 w-6 rounded-lg" /><Skeleton className="h-4 w-32" /><Skeleton className="h-6 w-6 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 space-y-1">
            <Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0" /><div className="space-y-1 flex-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div>
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex justify-between"><div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-5 w-20" /></div><div className="space-y-1 items-end flex flex-col"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-16" /></div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

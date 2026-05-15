import { Skeleton } from '@/components/ui/Skeleton'
export default function GoalsLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-20" /><Skeleton className="h-4 w-44" /></div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 space-y-1"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /></div>)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="h-1 bg-gray-100 w-full" />
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl shrink-0" /><div className="space-y-1 flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div>
              <Skeleton className="h-2.5 w-full rounded-full" />
              <div className="flex justify-between"><div className="space-y-1"><Skeleton className="h-3 w-14" /><Skeleton className="h-6 w-24" /></div><div className="space-y-1 items-end flex flex-col"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-20" /></div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

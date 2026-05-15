import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton'
export default function AccountsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-24" /><Skeleton className="h-4 w-40" /></div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-8 rounded-lg" /></div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton'
export default function TransactionsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-28" /><Skeleton className="h-4 w-36" /></div>
        <div className="flex gap-2"><Skeleton className="h-10 w-28 rounded-xl" /><Skeleton className="h-10 w-28 rounded-xl" /></div>
      </div>
      <div className="flex gap-2 items-center">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg ml-auto" />
      </div>
      <SkeletonTable rows={8} />
    </div>
  )
}

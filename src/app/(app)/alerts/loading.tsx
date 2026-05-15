import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton'
export default function AlertsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-48" /></div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <SkeletonTable rows={5} />
    </div>
  )
}

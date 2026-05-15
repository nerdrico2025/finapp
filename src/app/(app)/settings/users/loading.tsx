import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton'
export default function UsersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-24" /><Skeleton className="h-4 w-40" /></div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <SkeletonTable rows={4} />
    </div>
  )
}

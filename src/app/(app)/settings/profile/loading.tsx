import { Skeleton } from '@/components/ui/Skeleton'
export default function ProfileLoading() {
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-1"><Skeleton className="h-7 w-28" /><Skeleton className="h-4 w-52" /></div>
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 2 }).map((_, j) => <div key={j} className="space-y-1.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}
          <div className="flex justify-end"><Skeleton className="h-10 w-36 rounded-lg" /></div>
        </div>
      ))}
    </div>
  )
}

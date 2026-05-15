import { Skeleton } from '@/components/ui/Skeleton'
export default function CategoriesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1"><Skeleton className="h-7 w-28" /><Skeleton className="h-4 w-40" /></div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      {['Despesas', 'Receitas'].map((s) => (
        <div key={s} className="bg-white rounded-2xl border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50"><Skeleton className="h-4 w-32" /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0 divide-x divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="flex items-center gap-2"><Skeleton className="w-8 h-8 rounded-xl" /><Skeleton className="h-3.5 w-20" /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FinApp — Controle financeiro pessoal e empresarial',
  description:
    'Do salário à empresa, tudo em um lugar só. Comece grátis, evolua quando quiser.',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>
}

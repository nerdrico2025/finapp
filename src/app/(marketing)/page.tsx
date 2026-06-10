import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp, Upload, Target, BarChart2, RefreshCw, Building2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LandingNav } from '@/components/marketing/LandingNav'
import { PlanCTA } from '@/components/marketing/PlanCTA'
import { FaqAccordion } from '@/components/marketing/FaqAccordion'

const FEATURES = [
  {
    Icon: TrendingUp,
    title: 'Controle completo',
    description:
      'Receitas, despesas e transferências com categorias inteligentes e detecção de duplicatas.',
  },
  {
    Icon: Upload,
    title: 'Importação de extratos',
    description: 'CSV, XLSX, OFX e PDF. Suporte especial para BTG, Nubank, Itaú e mais.',
  },
  {
    Icon: Target,
    title: 'Metas e sonhos',
    description: 'Defina objetivos financeiros e acompanhe seu progresso mês a mês.',
  },
  {
    Icon: BarChart2,
    title: 'Relatórios avançados',
    description:
      'Gráficos de despesas por categoria, comparativo mensal e análise de orçamento.',
  },
  {
    Icon: RefreshCw,
    title: 'Lançamentos recorrentes',
    description:
      'Automatize contas fixas e receba alertas de vencimento integrados ao Google Calendar.',
  },
  {
    Icon: Building2,
    title: 'Gestão empresarial',
    description:
      'DRE e fluxo de caixa para sua empresa no mesmo app das suas finanças pessoais.',
  },
]

const FREE_FEATURES = [
  '30 transações/mês',
  '2 contas bancárias',
  'Categorias personalizadas',
  'Metas e alertas básicos',
]

const PRO_PF_FEATURES = [
  'Tudo do gratuito',
  'Transações ilimitadas',
  'Contas ilimitadas',
  'Importação de extratos',
  'Simulador de investimentos',
  'Lista de sonhos',
  'IA (em breve)',
]

const PRO_PJ_FEATURES = [
  'Tudo do Pro Pessoal',
  'DRE completo',
  'Fluxo de caixa',
  'Gestão multi-entidade',
]

const BANKS = ['BTG Pactual', 'Nubank', 'Itaú', 'Bradesco', 'Inter', 'XP']

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const proPfPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PF ?? ''
  const proPjPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PJ ?? ''

  return (
    <>
      <LandingNav />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            ✦ Grátis para sempre no plano básico
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
            Controle pessoal
            <br />
            <span className="text-emerald-600">e empresarial</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Do salário à empresa, tudo em um lugar só.
            <br className="hidden sm:inline" /> Comece grátis, evolua quando quiser.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors text-base"
            >
              Começar grátis
            </Link>
            <a
              href="#planos"
              className="inline-flex items-center justify-center px-8 py-3.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-base"
            >
              Ver planos
            </a>
          </div>
        </div>
      </section>

      {/* ── Social proof ───────────────────────────────────────────────── */}
      <section className="py-10 border-y border-gray-100 bg-gray-50 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-6">
            Importação de extratos de
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {BANKS.map((bank) => (
              <span key={bank} className="text-gray-400 font-semibold text-sm md:text-base">
                {bank}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="funcionalidades" className="py-20 md:py-28 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
              Tudo que você precisa para organizar
              <br className="hidden sm:inline" /> sua vida financeira
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 md:gap-6">
            {FEATURES.map(({ Icon, title, description }) => (
              <div
                key={title}
                className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6 hover:border-emerald-200 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1.5 text-sm md:text-base">
                  {title}
                </h3>
                <p className="text-xs md:text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ──────────────────────────────────────────────────────── */}
      <section id="planos" className="py-20 md:py-28 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Planos simples, sem surpresas
            </h2>
            <p className="text-lg text-gray-600">Comece grátis. Assine quando fizer sentido.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Gratuito */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Gratuito</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-gray-900">R$ 0</span>
                <span className="text-gray-500 text-sm">/mês</span>
              </div>
              <p className="text-xs text-gray-400 mb-7">Para sempre</p>
              <ul className="space-y-3 mb-8">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="block text-center w-full py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Começar grátis
              </Link>
            </div>

            {/* Pro Pessoal — destaque */}
            <div className="bg-white border-2 border-emerald-500 rounded-2xl p-8 relative shadow-xl shadow-emerald-100">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide">
                  Mais popular
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Pro Pessoal</h3>
              <div className="flex items-baseline gap-1 mb-7">
                <span className="text-4xl font-bold text-emerald-600">R$ 7</span>
                <span className="text-gray-500 text-sm">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {PRO_PF_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <PlanCTA
                priceId={proPfPriceId}
                planSlug="pro_pf"
                label="Assinar Pro Pessoal"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {/* Pro Empresarial */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Pro Empresarial</h3>
              <div className="flex items-baseline gap-1 mb-7">
                <span className="text-4xl font-bold text-gray-900">R$ 24,90</span>
                <span className="text-gray-500 text-sm">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {PRO_PJ_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <PlanCTA
                priceId={proPjPriceId}
                planSlug="pro_pj"
                label="Assinar Pro Empresarial"
                className="w-full py-3 border border-emerald-600 text-emerald-600 font-semibold rounded-xl hover:bg-emerald-50 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 mt-10">
            Já tem um plano? Adicione o módulo complementar com 40% de desconto. Gerencie em{' '}
            <Link href="/subscription" className="text-emerald-600 hover:underline font-medium">
              /subscription
            </Link>
          </p>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 md:py-28 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Perguntas frequentes
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-14 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <span className="text-white font-bold text-lg">FinApp</span>
              </div>
              <p className="text-sm text-gray-500">Controle financeiro simples e poderoso.</p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <Link href="/login" className="hover:text-white transition-colors">
                Entrar
              </Link>
              <Link href="/signup" className="hover:text-white transition-colors">
                Cadastrar
              </Link>
              <Link href="/subscription" className="hover:text-white transition-colors">
                Assinatura
              </Link>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-600">© 2026 FinApp. Todos os direitos reservados.</p>
            <p className="text-sm text-gray-600">
              Já é cliente?{' '}
              <Link
                href="/login"
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Fazer login →
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim. Ao cancelar, você mantém acesso ao plano pago até o fim do período já pago. Depois disso, sua conta volta ao plano gratuito automaticamente.',
  },
  {
    q: 'Como funciona o plano gratuito?',
    a: 'O plano gratuito é permanente e inclui até 30 transações por mês e 2 contas bancárias. Sem cartão de crédito necessário para começar.',
  },
  {
    q: 'Posso ter controle pessoal e empresarial juntos?',
    a: 'Sim. Você pode assinar o Pro Pessoal e adicionar o Módulo Empresarial com 40% de desconto, ou vice-versa.',
  },
  {
    q: 'Os dados são seguros?',
    a: 'Sim. Todos os dados são armazenados no Supabase com criptografia e isolamento total por usuário via Row Level Security.',
  },
  {
    q: 'Como funciona a importação de extratos?',
    a: 'Suportamos arquivos CSV, XLSX, OFX e PDF. O app detecta automaticamente duplicatas e sugere categorias para cada transação.',
  },
]

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {FAQS.map((faq, i) => (
        <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
                openIndex === i ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openIndex === i && (
            <div className="px-6 pb-5 text-gray-600 leading-relaxed text-sm">{faq.a}</div>
          )}
        </div>
      ))}
    </div>
  )
}

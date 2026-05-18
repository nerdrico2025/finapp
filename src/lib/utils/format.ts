export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function parseCurrency(str: string): number {
  if (!str) return 0
  const cleaned = str
    .replace(/R\$\s?/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(cleaned) || 0
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  return new Intl.DateTimeFormat('pt-BR').format(d)
}

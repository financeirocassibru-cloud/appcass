'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import type { Category } from '@/lib/db/queries/categories'

/**
 * Filtros do extrato.
 *
 * Vivem no query string, e não em estado de componente: assim o filtro sobrevive
 * a recarregar a página, volta com o botão de voltar do navegador, e o link pode
 * ser guardado.
 */
export function Filters({ categories, month }: { categories: Category[]; month: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set('mes', month)
    if (value === '') next.delete(key)
    else next.set(key, value)
    router.replace(`/lancamentos?${next.toString()}` as Route)
  }

  const selectClass =
    'border-input bg-card min-h-11 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:border-primary'

  return (
    <div className="flex gap-2">
      <label className="flex-1">
        <span className="sr-only">Tipo</span>
        <select
          value={params.get('tipo') ?? ''}
          onChange={(event) => setParam('tipo', event.target.value)}
          className={selectClass}
        >
          <option value="">Tudo</option>
          <option value="expense">Saídas</option>
          <option value="income">Entradas</option>
        </select>
      </label>

      <label className="flex-1">
        <span className="sr-only">Categoria</span>
        <select
          value={params.get('categoria') ?? ''}
          onChange={(event) => setParam('categoria', event.target.value)}
          className={selectClass}
        >
          <option value="">Categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex-1">
        <span className="sr-only">Situação</span>
        <select
          value={params.get('status') ?? ''}
          onChange={(event) => setParam('status', event.target.value)}
          className={selectClass}
        >
          <option value="">Situação</option>
          <option value="pago">Pagos</option>
          <option value="pendente">Pendentes</option>
        </select>
      </label>
    </div>
  )
}

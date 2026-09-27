import { listAllCategories } from '@/lib/db/queries/categories'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import { CategoryList, NewCategoryForm } from './forms'

// v1.1 — 2026-09-27: as palavras-chave sugerem o que já veio nos extratos importados.

export const metadata = { title: 'Categorias · Finanças' }
export const dynamic = 'force-dynamic'

export default async function CategoriasPage() {
  const [categories, imported] = await Promise.all([listAllCategories(), listImportedDescriptions()])

  const active = categories.filter((c) => c.archivedAt === null)
  const archived = categories.filter((c) => c.archivedAt !== null)

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm">
        Cada conta nasce com as categorias-semente criadas pelo banco. Categorias arquivadas
        saem dos seletores mas continuam nomeando os lançamentos antigos.
      </p>

      <NewCategoryForm />

      <CategoryList title="Ativas" categories={active} suggestions={imported} />
      {archived.length > 0 ? (
        <CategoryList title="Arquivadas" categories={archived} suggestions={imported} />
      ) : null}
    </div>
  )
}

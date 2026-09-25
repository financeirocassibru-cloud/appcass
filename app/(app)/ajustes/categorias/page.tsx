import { listAllCategories } from '@/lib/db/queries/categories'
import { CategoryList, NewCategoryForm } from './forms'

export const metadata = { title: 'Categorias · Finanças' }
export const dynamic = 'force-dynamic'

export default async function CategoriasPage() {
  const categories = await listAllCategories()

  const active = categories.filter((c) => c.archivedAt === null)
  const archived = categories.filter((c) => c.archivedAt !== null)

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm">
        Cada conta nasce com as categorias-semente criadas pelo banco. Categorias arquivadas
        saem dos seletores mas continuam nomeando os lançamentos antigos.
      </p>

      <NewCategoryForm />

      <CategoryList title="Ativas" categories={active} />
      {archived.length > 0 ? <CategoryList title="Arquivadas" categories={archived} /> : null}
    </div>
  )
}

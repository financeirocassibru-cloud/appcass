'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createScenario, type ScenarioActionState } from '@/lib/actions/scenarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'

const initialState: ScenarioActionState = {}

export function NewScenarioForm({ today, defaultEnd }: { today: string; defaultEnd: string }) {
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) => {
      const result = await createScenario(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
      }
      return result
    },
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-nome">Nome</Label>
        <Input
          id="campo-nome"
          name="name"
          required
          maxLength={60}
          placeholder="E se eu trocar de carro"
          className="min-h-11 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-inicio">De</Label>
          <Input
            id="campo-inicio"
            name="startsOn"
            type="date"
            required
            defaultValue={today}
            className="min-h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-fim">Até</Label>
          <Input
            id="campo-fim"
            name="endsOn"
            type="date"
            required
            defaultValue={defaultEnd}
            className="min-h-11 text-base"
          />
        </div>
      </div>

      <FormMessage error={state.error} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Criando…' : 'Criar cenário'}
      </Button>
    </form>
  )
}

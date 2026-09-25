import { Button } from '@/components/ui/button'

export function LogoutButton() {
  return (
    // POST, e não link: um GET permitiria encerrar a sessão de alguém a partir
    // de uma imagem ou link de terceiro.
    <form action="/auth/logout" method="post">
      <Button type="submit" variant="outline" className="min-h-11 w-full text-base">
        Sair
      </Button>
    </form>
  )
}

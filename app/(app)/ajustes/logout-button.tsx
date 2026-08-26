export function LogoutButton() {
  return (
    // POST, e não link: um GET permitiria encerrar a sessão de alguém a partir
    // de uma imagem ou link de terceiro.
    <form action="/auth/logout" method="post">
      <button
        type="submit"
        className="min-h-11 w-full rounded-lg border border-[var(--border)] px-4 text-base font-medium"
      >
        Sair
      </button>
    </form>
  )
}

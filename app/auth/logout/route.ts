import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Logout por POST — GET permitiria encerrar a sessão por link de terceiro. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${request.nextUrl.origin}/login`, { status: 303 })
}

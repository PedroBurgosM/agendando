import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true, message: 'Sesión cerrada exitosamente.' });
  const isProd = process.env.NODE_ENV === 'production';
  const expiredCookie = `agendando_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    isProd ? '; Secure' : ''
  }`;
  response.headers.set('Set-Cookie', expiredCookie);
  return response;
}

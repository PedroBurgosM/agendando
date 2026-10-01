import { NextResponse } from 'next/server';
import { createSessionToken, verifyPassword } from '../../../lib/auth';
import { getSupabase } from '../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Debes ingresar correo electrónico y contraseña.' },
        { status: 400 }
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash, name, role')
      .ilike('email', email)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Credenciales inválidas. Revisa el correo o la contraseña.' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas. Revisa el correo o la contraseña.' },
        { status: 401 }
      );
    }

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = await createSessionToken(authUser);

    const response = NextResponse.json({
      ok: true,
      message: 'Inicio de sesión exitoso.',
      user: authUser,
      token,
    });

    const maxAge = 7 * 24 * 3600;
    const isProd = process.env.NODE_ENV === 'production';
    const cookieValue = `agendando_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
      isProd ? '; Secure' : ''
    }`;

    response.headers.set('Set-Cookie', cookieValue);

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error al iniciar sesión en el servidor.' },
      { status: 500 }
    );
  }
}

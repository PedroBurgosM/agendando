import { NextResponse } from 'next/server';
import { createSessionToken, verifyPassword } from '../../../lib/auth';
import { getSupabase } from '../../../lib/supabase';
import { getBusinessForUser } from '../../../lib/tenant';

// Rate Limiter en memoria: máximo 5 intentos fallidos cada 10 minutos por IP/email
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };
  if (now > entry.resetAt) {
    loginAttempts.delete(key);
    return { allowed: true };
  }
  if (entry.count >= 5) {
    const waitMinutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
    return { allowed: false, waitMinutes };
  }
  return { allowed: true };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutos
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
}

function clearRateLimit(key: string) {
  loginAttempts.delete(key);
}

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

    // Identificador para control de intentos (IP + Email)
    const forwardedHeader = request.headers.get('x-forwarded-for');
    const clientIp = forwardedHeader ? forwardedHeader.split(',')[0].trim() : 'local';
    const rateKey = `${clientIp}:${email}`;

    const limitStatus = checkRateLimit(rateKey);
    if (!limitStatus.allowed) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Por seguridad, espera ${limitStatus.waitMinutes} minuto(s) antes de volver a intentar.` },
        { status: 429 }
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash, name, role')
      .ilike('email', email)
      .maybeSingle();

    if (userError || !user) {
      recordFailedAttempt(rateKey);
      return NextResponse.json(
        { error: 'Credenciales inválidas. Revisa el correo o la contraseña.' },
        { status: 401 }
      );
    }

    if (user.password_hash && user.password_hash.startsWith('DISABLED:')) {
      return NextResponse.json(
        { error: 'Esta cuenta se encuentra dada de baja o suspendida. Comunícate con el administrador.' },
        { status: 403 }
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      recordFailedAttempt(rateKey);
      return NextResponse.json(
        { error: 'Credenciales inválidas. Revisa el correo o la contraseña.' },
        { status: 401 }
      );
    }

    // Inicio de sesión exitoso: limpiar contador de intentos
    clearRateLimit(rateKey);

    const emailLower = (user.email || '').toLowerCase().trim();
    const superAdmin = emailLower === 'admin@agendando.cl' || user.role === 'superadmin' || String(user.id) === '1';

    let business = null;
    if (supabase) {
      business = await getBusinessForUser(supabase, {
        userId: String(user.id),
        displayName: user.name,
        email: user.email,
        fullName: user.name,
        role: user.role,
      }, false);
    }

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: superAdmin ? 'superadmin' : (user.role || 'admin'),
      isSuperAdmin: superAdmin,
      business: business ? {
        id: business.id,
        name: business.name,
        slug: business.slug,
        phone: business.phone,
      } : null,
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

import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { getSupabase } from '../../../lib/supabase';
import { getBusinessForUser, isSuperAdmin } from '../../../lib/tenant';
import { createSessionToken, hashPassword, verifyPassword } from '../../../lib/auth';

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const supabase = getSupabase();
    let business = null;
    if (supabase) {
      business = await getBusinessForUser(supabase, user, false);
    }

    const superAdmin = isSuperAdmin(user);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.userId,
        name: user.displayName || user.fullName,
        email: user.email,
        role: superAdmin ? 'superadmin' : (user.role || 'admin'),
        isSuperAdmin: superAdmin,
        business: business ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          phone: business.phone,
        } : null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error al verificar sesión.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ authenticated: false, error: 'Debes iniciar sesión.' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const body = (await request.json()) as {
      action?: 'update_profile' | 'change_password';
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    // Fetch existing user from database
    const { data: dbUser, error: dbErr } = await supabase
      .from('users')
      .select('id, email, password_hash, name, role')
      .eq('id', user.userId)
      .maybeSingle();

    if (dbErr || !dbUser) {
      return NextResponse.json({ error: 'Usuario no encontrado en la base de datos.' }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    // 1. Password change validation & hashing
    if (body.action === 'change_password' || body.newPassword) {
      const currentPassword = (body.currentPassword || '').trim();
      const newPassword = (body.newPassword || '').trim();
      const confirmPassword = (body.confirmPassword || '').trim();

      if (!currentPassword) {
        return NextResponse.json({ error: 'Debes ingresar tu contraseña actual.' }, { status: 400 });
      }

      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
      }

      if (confirmPassword && newPassword !== confirmPassword) {
        return NextResponse.json({ error: 'La confirmación de la contraseña no coincide.' }, { status: 400 });
      }

      const isValid = await verifyPassword(currentPassword, dbUser.password_hash);
      if (!isValid) {
        return NextResponse.json({ error: 'La contraseña actual ingresada es incorrecta.' }, { status: 400 });
      }

      updates.password_hash = await hashPassword(newPassword);
    }

    // 2. Profile update (name, email)
    if (body.action === 'update_profile' || (body.name !== undefined || body.email !== undefined)) {
      if (body.name !== undefined) {
        const name = body.name.trim();
        if (name.length < 2) {
          return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres.' }, { status: 400 });
        }
        updates.name = name;
      }

      if (body.email !== undefined) {
        const email = body.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return NextResponse.json({ error: 'El formato del correo electrónico no es válido.' }, { status: 400 });
        }

        if (email !== (dbUser.email || '').toLowerCase()) {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .ilike('email', email)
            .neq('id', dbUser.id)
            .maybeSingle();

          if (existingUser) {
            return NextResponse.json({ error: 'El correo electrónico ya está registrado por otra cuenta.' }, { status: 400 });
          }
          updates.email = email;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No se indicaron cambios para guardar.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', dbUser.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message || 'Error al actualizar los datos en el servidor.' }, { status: 500 });
    }

    const finalName = updates.name !== undefined ? updates.name : dbUser.name;
    const finalEmail = updates.email !== undefined ? updates.email : dbUser.email;
    const finalRole = dbUser.role || 'admin';

    const updatedUserForTenant = {
      userId: String(dbUser.id),
      displayName: finalName,
      email: finalEmail,
      fullName: finalName,
      role: finalRole,
    };

    const superAdmin = isSuperAdmin(updatedUserForTenant);
    let business = await getBusinessForUser(supabase, updatedUserForTenant, false);

    const authUser = {
      id: dbUser.id,
      email: finalEmail,
      name: finalName,
      role: superAdmin ? 'superadmin' : finalRole,
      isSuperAdmin: superAdmin,
      business: business ? {
        id: business.id,
        name: business.name,
        slug: business.slug,
        phone: business.phone,
      } : null,
    };

    const token = await createSessionToken(authUser);
    const maxAge = 7 * 24 * 3600;
    const isProd = process.env.NODE_ENV === 'production';
    const cookieValue = `agendando_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
      isProd ? '; Secure' : ''
    }`;

    const isPasswordChangeOnly = Boolean(updates.password_hash && !updates.name && !updates.email);

    const response = NextResponse.json({
      ok: true,
      message: isPasswordChangeOnly
        ? 'Contraseña de ingreso actualizada exitosamente.'
        : 'Datos de tu perfil actualizados exitosamente.',
      user: authUser,
      token,
    });

    response.headers.set('Set-Cookie', cookieValue);
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error al actualizar los datos.' },
      { status: 500 }
    );
  }
}


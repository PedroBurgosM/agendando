import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { getSupabase } from '../../../lib/supabase';
import { hashPassword } from '../../../lib/auth';
import { isSuperAdmin } from '../../../lib/tenant';

function sanitizeSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'negocio';
}

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

// GET /api/admin/profiles - List all client profiles (Superadmin only)
export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: 'Acceso no autorizado. Se requiere rol de Super Administrador.' }, { status: 403 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });
    }

    // 1. Fetch users (excluding superadmin)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, role, password_hash, created_at')
      .order('id', { ascending: true });

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // 2. Fetch all businesses
    const { data: businesses, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .order('id', { ascending: true });

    if (bizError) {
      return NextResponse.json({ error: bizError.message }, { status: 500 });
    }

    // 3. Fetch summary counts for services, customers, bookings
    const [custRes, servRes, bookRes] = await Promise.all([
      supabase.from('customers').select('id, business_id'),
      supabase.from('services').select('id, business_id'),
      supabase.from('bookings').select('id, business_id'),
    ]);

    const customersByBiz: Record<number, number> = {};
    (custRes.data || []).forEach((c) => {
      customersByBiz[c.business_id] = (customersByBiz[c.business_id] || 0) + 1;
    });

    const servicesByBiz: Record<number, number> = {};
    (servRes.data || []).forEach((s) => {
      servicesByBiz[s.business_id] = (servicesByBiz[s.business_id] || 0) + 1;
    });

    const bookingsByBiz: Record<number, number> = {};
    (bookRes.data || []).forEach((b) => {
      bookingsByBiz[b.business_id] = (bookingsByBiz[b.business_id] || 0) + 1;
    });

    // Map profiles - ONLY CLIENTS (exclude superadmin)
    const clientUsers = (users || []).filter(
      (u) => !isSuperAdmin({ email: u.email, role: u.role, userId: u.id })
    );

    const profiles = clientUsers.map((u) => {
      const biz = (businesses || []).find((b) => b.owner_id === String(u.id));
      const bizId = biz ? biz.id : 0;
      const isInactive = Boolean(u.password_hash && u.password_hash.startsWith('DISABLED:'));

      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: isInactive ? 'inactive' : 'active',
        isActive: !isInactive,
        createdAt: u.created_at,
        business: biz
          ? {
              id: biz.id,
              name: biz.name,
              slug: biz.slug,
              email: biz.email,
              phone: biz.phone,
              address: biz.address,
              description: biz.description,
              timezone: biz.timezone,
              currency: biz.currency,
              cancellationHours: biz.cancellation_hours,
              bookingWindowDays: biz.booking_window_days,
            }
          : null,
        stats: {
          customersCount: bizId ? customersByBiz[bizId] || 0 : 0,
          servicesCount: bizId ? servicesByBiz[bizId] || 0 : 0,
          bookingsCount: bizId ? bookingsByBiz[bizId] || 0 : 0,
        },
      };
    });

    return NextResponse.json({ ok: true, profiles });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al obtener perfiles.' }, { status: 500 });
  }
}

// POST /api/admin/profiles - Create a new client profile & space
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: 'Acceso no autorizado. Se requiere rol de Super Administrador.' }, { status: 403 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });
    }

    const body = (await request.json()) as Record<string, any>;
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const rawPassword = (body.password || '').trim() || generatePassword(10);
    const businessName = (body.businessName || '').trim() || `Espacio de ${name}`;
    let slug = sanitizeSlug(body.slug || businessName);
    const phone = (body.phone || '').trim();
    const address = (body.address || '').trim();
    const createSampleData = Boolean(body.createSampleData ?? false);
    const createInstructor = Boolean(body.createInstructor ?? false);

    if (!name || !email) {
      return NextResponse.json({ error: 'Nombre y correo electrónico son requeridos.' }, { status: 400 });
    }

    // 1. Verify email is not already taken
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: `El correo "${email}" ya se encuentra registrado.` }, { status: 409 });
    }

    // 2. Ensure unique slug
    let candidateSlug = slug;
    let attempts = 0;
    while (attempts < 5) {
      const { data: slugCheck } = await supabase
        .from('businesses')
        .select('id')
        .eq('slug', candidateSlug)
        .maybeSingle();

      if (!slugCheck) {
        slug = candidateSlug;
        break;
      }
      attempts++;
      candidateSlug = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // 3. Create user in `users`
    const { data: maxUser } = await supabase.from('users').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
    const nextUserId = (maxUser?.id ? Number(maxUser.id) : 0) + 1;

    const passwordHash = await hashPassword(rawPassword);
    const { data: newUser, error: userCreateError } = await supabase
      .from('users')
      .insert({
        id: nextUserId,
        name,
        email,
        password_hash: passwordHash,
        role: 'admin',
      })
      .select('id, email, name, role, created_at')
      .single();

    if (userCreateError || !newUser) {
      return NextResponse.json({ error: userCreateError?.message || 'No se pudo crear el usuario.' }, { status: 500 });
    }

    // 4. Create business in `businesses`
    const { data: maxBiz } = await supabase.from('businesses').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
    const nextBizId = (maxBiz?.id ? Number(maxBiz.id) : 0) + 1;

    const { data: newBusiness, error: bizCreateError } = await supabase
      .from('businesses')
      .insert({
        id: nextBizId,
        owner_id: String(newUser.id),
        name: businessName,
        slug,
        email,
        phone: phone || null,
        address: address || null,
        timezone: 'America/Santiago',
        currency: 'CLP',
        cancellation_hours: 24,
        booking_window_days: 60,
      })
      .select()
      .single();

    if (bizCreateError || !newBusiness) {
      // rollback user
      await supabase.from('users').delete().eq('id', newUser.id);
      return NextResponse.json({ error: bizCreateError?.message || 'No se pudo crear el negocio del cliente.' }, { status: 500 });
    }

    // 5. Optionally create default professional if requested
    if (createInstructor) {
      const { data: maxPro } = await supabase.from('professionals').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
      const nextProId = (maxPro?.id ? Number(maxPro.id) : 0) + 1;

      await supabase.from('professionals').insert({
        id: nextProId,
        business_id: newBusiness.id,
        name,
        email,
        phone: phone || '+56 9 0000 0000',
        role: 'Instructor Principal',
        color: '#7559f2',
        active: true,
      });
    }

    // 6. Optionally create welcome sample service
    if (createSampleData) {
      const { data: maxServ } = await supabase.from('services').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
      const nextServId = (maxServ?.id ? Number(maxServ.id) : 0) + 1;

      await supabase.from('services').insert({
        id: nextServId,
        business_id: newBusiness.id,
        name: 'Clase General de Bienvenida',
        description: 'Primera clase de prueba para tus alumnos.',
        mode: 'presencial',
        class_type: 'grupal',
        capacity: 10,
        billing_period: 'mensual',
        schedule: 'Lunes a Viernes',
        duration_minutes: 60,
        price_clp: 30000,
        deposit_percent: 0,
        active: true,
      });
    }

    return NextResponse.json({
      ok: true,
      message: 'Cliente creado exitosamente.',
      profile: {
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.created_at,
        business: {
          id: newBusiness.id,
          name: newBusiness.name,
          slug: newBusiness.slug,
          phone: newBusiness.phone,
          address: newBusiness.address,
        },
      },
      credentials: {
        email,
        password: rawPassword,
        businessName,
        slug,
        loginUrl: '/',
        bookingUrl: `/reservar?negocio=${slug}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al crear perfil.' }, { status: 500 });
  }
}

// PUT /api/admin/profiles - Update client profile / reset password
export async function PUT(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 403 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });
    }

    const body = (await request.json()) as Record<string, any>;
    const userId = Number(body.userId);
    if (!userId) {
      return NextResponse.json({ error: 'ID de usuario inválido.' }, { status: 400 });
    }

    // Acción especial: Dar de baja o Reactivar
    if (body.action === 'toggle_status' || body.action === 'deactivate' || body.action === 'activate') {
      if (userId === 1 || String(userId) === String(user.userId)) {
        return NextResponse.json({ error: 'No se puede dar de baja al Super Administrador.' }, { status: 400 });
      }

      const { data: targetUser } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('id', userId)
        .single();

      if (!targetUser) {
        return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
      }

      const currentlyDisabled = Boolean(targetUser.password_hash && targetUser.password_hash.startsWith('DISABLED:'));
      const shouldDisable = body.action === 'deactivate' ? true : body.action === 'activate' ? false : !currentlyDisabled;

      let newHash = targetUser.password_hash;
      if (shouldDisable && !currentlyDisabled) {
        newHash = `DISABLED:${targetUser.password_hash}`;
      } else if (!shouldDisable && currentlyDisabled) {
        newHash = targetUser.password_hash.replace(/^DISABLED:/, '');
      }

      await supabase.from('users').update({ password_hash: newHash }).eq('id', userId);

      return NextResponse.json({
        ok: true,
        status: shouldDisable ? 'inactive' : 'active',
        message: shouldDisable ? 'Cuenta del cliente dada de baja correctamente.' : 'Cuenta del cliente reactivada exitosamente.',
      });
    }

    const updates: Record<string, any> = {};
    if (body.name) updates.name = body.name.trim();
    if (body.email) updates.email = body.email.trim().toLowerCase();

    // If new password provided
    if (body.password && body.password.trim()) {
      updates.password_hash = await hashPassword(body.password.trim());
    }

    if (Object.keys(updates).length > 0) {
      const { error: userErr } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (userErr) {
        return NextResponse.json({ error: userErr.message }, { status: 500 });
      }
    }

    // Update business if provided
    if (body.businessName || body.phone !== undefined || body.address !== undefined || body.slug) {
      const bizUpdates: Record<string, any> = {};
      if (body.businessName) bizUpdates.name = body.businessName.trim();
      if (body.phone !== undefined) bizUpdates.phone = body.phone.trim();
      if (body.address !== undefined) bizUpdates.address = body.address.trim();
      if (body.slug) bizUpdates.slug = sanitizeSlug(body.slug);

      await supabase
        .from('businesses')
        .update(bizUpdates)
        .eq('owner_id', String(userId));
    }

    return NextResponse.json({ ok: true, message: 'Perfil actualizado exitosamente.' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al actualizar perfil.' }, { status: 500 });
  }
}

// DELETE /api/admin/profiles - Delete a client account and business
export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 403 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userId = Number(searchParams.get('userId'));

    if (!userId) {
      return NextResponse.json({ error: 'ID de usuario inválido.' }, { status: 400 });
    }

    if (userId === 1 || String(userId) === String(user.userId)) {
      return NextResponse.json({ error: 'No es posible eliminar la cuenta del Super Administrador principal.' }, { status: 400 });
    }

    // Delete businesses owned by this user (cascades to services, customers, bookings, etc.)
    await supabase.from('businesses').delete().eq('owner_id', String(userId));

    // Delete user
    const { error: delErr } = await supabase.from('users').delete().eq('id', userId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Cuenta y espacio de cliente eliminados correctamente.' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al eliminar perfil.' }, { status: 500 });
  }
}

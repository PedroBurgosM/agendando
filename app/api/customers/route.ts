import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';

async function getBusiness(supabase: any, ownerId: string, create = false) {
  let { data: business } = await supabase
    .from('businesses')
    .select('*')
    .or(`owner_id.eq.${ownerId},owner_id.eq.1,owner_id.eq.usr_local_instructor`)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!business && create) {
    const { data: created } = await supabase
      .from('businesses')
      .insert({
        owner_id: ownerId,
        name: 'Espacio de Clases',
        slug: `espacio-${ownerId}-${Date.now()}`,
        timezone: 'America/Santiago',
      })
      .select()
      .single();
    business = created;
  }
  return business;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId);
  if (!business) {
    return NextResponse.json({ customers: [], visits: [], stats: { total: 0, active: 0, pending: 0, overdue: 0, inactive: 0, monthlyRevenue: 0 } });
  }

  const nowSec = Math.floor(Date.now() / 1000);

  const { data: rawCustomers, error } = await supabase
    .from('customers')
    .select(`
      id, name, email, phone, notes,
      plan_name, monthly_fee, payment_due_day, membership_status,
      last_payment_date, next_payment_due, notify_email, notify_whatsapp,
      bookings(id, starts_at, status, payment_status, amount_clp)
    `)
    .eq('business_id', business.id)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const customers = (rawCustomers || []).map((c: any) => {
    let computedStatus = c.membership_status || 'active';
    let dueTimeSec: number | null = null;
    if (c.next_payment_due) {
      dueTimeSec = Math.floor(new Date(c.next_payment_due).getTime() / 1000);
    }

    if (computedStatus !== 'inactive' && dueTimeSec) {
      if (nowSec > dueTimeSec) {
        computedStatus = 'overdue';
      } else if (dueTimeSec - nowSec <= 5 * 86400) {
        computedStatus = 'pending';
      } else if (c.membership_status === 'overdue') {
        computedStatus = 'overdue';
      } else if (c.membership_status === 'pending') {
        computedStatus = 'pending';
      } else {
        computedStatus = 'active';
      }
    }

    const validBookings = (c.bookings || []).filter((b: any) => b.status !== 'cancelled');
    const paidTotal = validBookings
      .filter((b: any) => b.payment_status === 'paid')
      .reduce((sum: number, b: any) => sum + (b.amount_clp || 0), 0);

    const bookingDates = validBookings
      .map((b: any) => (b.starts_at ? new Date(b.starts_at).getTime() / 1000 : 0))
      .filter(Boolean);
    const lastBooking = bookingDates.length ? Math.max(...bookingDates) : null;

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      plan_name: c.plan_name,
      monthly_fee: c.monthly_fee,
      payment_due_day: c.payment_due_day,
      membership_status: computedStatus,
      last_payment_date: c.last_payment_date ? Math.floor(new Date(c.last_payment_date).getTime() / 1000) : null,
      next_payment_due: dueTimeSec,
      notify_email: c.notify_email,
      notify_whatsapp: c.notify_whatsapp,
      booking_count: validBookings.length,
      paid_total: paidTotal,
      last_booking: lastBooking,
    };
  });

  const { data: rawVisits } = await supabase
    .from('bookings')
    .select(`
      id, customer_id, starts_at, status, payment_status, amount_clp,
      services(name),
      professionals(name)
    `)
    .eq('business_id', business.id)
    .order('starts_at', { ascending: false });

  const visits = (rawVisits || []).map((v: any) => ({
    id: v.id,
    customer_id: v.customer_id,
    starts_at: v.starts_at ? Math.floor(new Date(v.starts_at).getTime() / 1000) : 0,
    status: v.status,
    payment_status: v.payment_status,
    amount_clp: v.amount_clp,
    service_name: v.services?.name || 'Clase',
    professional_name: v.professionals?.name || 'Instructor',
  }));

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.membership_status === 'active').length,
    pending: customers.filter(c => c.membership_status === 'pending').length,
    overdue: customers.filter(c => c.membership_status === 'overdue').length,
    inactive: customers.filter(c => c.membership_status === 'inactive').length,
    monthlyRevenue: customers
      .filter(c => c.membership_status !== 'inactive')
      .reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0),
  };

  return NextResponse.json({ customers, visits, stats });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const body = (await request.json()) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  let email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const planName = String(body.planName ?? 'Mensualidad Regular').trim();
  const monthlyFee = Number(body.monthlyFee ?? 0);
  const paymentDueDay = Math.min(Math.max(Number(body.paymentDueDay ?? 5), 1), 31);
  const membershipStatus = String(body.membershipStatus ?? 'active');
  const notifyEmail = body.notifyEmail !== false;
  const notifyWhatsapp = body.notifyWhatsapp !== false;

  if (!name) return NextResponse.json({ error: 'Ingresa el nombre del alumno o deudor.' }, { status: 400 });

  if (!email) {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    email = `deudor.${Date.now()}.${randomSuffix}@sin-correo.local`;
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Ingresa un correo electrónico válido.' }, { status: 400 });
  }

  const business = await getBusiness(supabase, user.userId, true);
  if (!business) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const { data: duplicate } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', business.id)
    .ilike('email', email)
    .maybeSingle();

  if (duplicate) return NextResponse.json({ error: 'Ya existe un alumno con ese correo.' }, { status: 409 });

  let nextPaymentDueIso: string;
  if (body.nextPaymentDue !== undefined && body.nextPaymentDue !== null) {
    nextPaymentDueIso = new Date(Number(body.nextPaymentDue) * 1000).toISOString();
  } else {
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), paymentDueDay, 23, 59, 59);
    if (membershipStatus !== 'overdue' && dueDate.getTime() <= now.getTime()) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }
    nextPaymentDueIso = dueDate.toISOString();
  }

  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      business_id: business.id,
      name,
      email,
      phone: phone || null,
      notes: notes || null,
      plan_name: planName,
      monthly_fee: monthlyFee,
      payment_due_day: paymentDueDay,
      membership_status: membershipStatus,
      next_payment_due: nextPaymentDueIso,
      notify_email: notifyEmail,
      notify_whatsapp: notifyWhatsapp,
    })
    .select('id')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || 'Error al registrar alumno.' }, { status: 500 });
  }

  return NextResponse.json({ id: created.id, message: 'Registrado correctamente.' }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Alumno inválido.' }, { status: 400 });

  if (body.membershipStatus !== undefined && Object.keys(body).length <= 2) {
    const status = String(body.membershipStatus);
    const valid = ['active', 'pending', 'overdue', 'inactive'].includes(status);
    if (!valid) return NextResponse.json({ error: 'Estado de membresía inválido.' }, { status: 400 });

    const { error } = await supabase
      .from('customers')
      .update({ membership_status: status })
      .eq('id', id)
      .eq('business_id', business.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      message: status === 'inactive' ? 'Alumno dado de baja (membresía pausada).' : 'Alumno reactivado correctamente.',
    });
  }

  const { data: existing } = await supabase
    .from('customers')
    .select('name, email, phone, notes, plan_name, monthly_fee, payment_due_day, membership_status, next_payment_due')
    .eq('id', id)
    .eq('business_id', business.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 });

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  let email = body.email !== undefined ? String(body.email).trim().toLowerCase() : existing.email;
  const phone = body.phone !== undefined ? String(body.phone).trim() : existing.phone;
  const notes = body.notes !== undefined ? String(body.notes).trim() : existing.notes;
  const planName = body.planName !== undefined ? String(body.planName).trim() : existing.plan_name;
  const monthlyFee = body.monthlyFee !== undefined ? Number(body.monthlyFee) : existing.monthly_fee;
  const paymentDueDay = body.paymentDueDay !== undefined ? Number(body.paymentDueDay) : existing.payment_due_day;
  const membershipStatus = body.membershipStatus !== undefined ? String(body.membershipStatus) : existing.membership_status;

  let nextPaymentDueIso: string | null = null;
  if (body.nextPaymentDue !== undefined) {
    nextPaymentDueIso = body.nextPaymentDue !== null ? new Date(Number(body.nextPaymentDue) * 1000).toISOString() : null;
  } else {
    nextPaymentDueIso = existing.next_payment_due;
  }

  const notifyEmail = body.notifyEmail !== undefined ? Boolean(body.notifyEmail) : undefined;
  const notifyWhatsapp = body.notifyWhatsapp !== undefined ? Boolean(body.notifyWhatsapp) : undefined;

  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });

  if (email && email !== existing.email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 });
    const { data: duplicate } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', business.id)
      .ilike('email', email)
      .neq('id', id)
      .maybeSingle();
    if (duplicate) return NextResponse.json({ error: 'Otro alumno ya utiliza ese correo.' }, { status: 409 });
  }

  const updatePayload: Record<string, unknown> = {
    name,
    email,
    phone: phone || null,
    notes: notes || null,
    plan_name: planName || 'Plan Regular',
    monthly_fee: monthlyFee,
    payment_due_day: paymentDueDay,
    membership_status: membershipStatus,
    next_payment_due: nextPaymentDueIso,
  };
  if (notifyEmail !== undefined) updatePayload.notify_email = notifyEmail;
  if (notifyWhatsapp !== undefined) updatePayload.notify_whatsapp = notifyWhatsapp;

  const { error } = await supabase
    .from('customers')
    .update(updatePayload)
    .eq('id', id)
    .eq('business_id', business.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Ficha de alumno actualizada correctamente.' });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  let id: number | null = null;
  let force = false;
  const { searchParams } = new URL(request.url);
  const queryId = searchParams.get('id');
  if (queryId) {
    id = Number(queryId);
    force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';
  } else {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      id = Number(body.id);
      force = body.force === true || body.force === '1' || body.force === 1;
    } catch {}
  }

  if (!id || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'ID de alumno inválido.' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', id)
    .eq('business_id', business.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id)
    .eq('business_id', business.id)
    .gte('starts_at', nowIso)
    .neq('status', 'cancelled');

  if (!force && count && count > 0) {
    return NextResponse.json(
      {
        error: `El alumno "${existing.name}" tiene ${count} clase(s) o reserva(s) programada(s). Puedes darlo de baja para pausar su membresía sin perder su historial, o confirmar su eliminación definitiva cancelando sus reservas.`,
        hasUpcoming: true,
        upcomingCount: count,
      },
      { status: 409 }
    );
  }

  await supabase.from('notifications').delete().eq('customer_id', id).eq('business_id', business.id);
  await supabase.from('payments').delete().eq('customer_id', id).eq('business_id', business.id);
  await supabase.from('bookings').delete().eq('customer_id', id).eq('business_id', business.id);

  const { error } = await supabase.from('customers').delete().eq('id', id).eq('business_id', business.id);
  if (error) {
    return NextResponse.json({ error: 'No se pudo eliminar el alumno.' }, { status: 500 });
  }

  return NextResponse.json({ message: `Alumno ${existing.name} eliminado correctamente.` });
}

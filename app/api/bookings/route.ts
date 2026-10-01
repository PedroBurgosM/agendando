import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';

async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

async function getBusiness(supabase: any, ownerId: string) {
  let { data: business } = await supabase
    .from('businesses')
    .select('*')
    .or(`owner_id.eq.${ownerId},owner_id.eq.1,owner_id.eq.usr_local_instructor`)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!business) {
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

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ bookings: [] });

  const { searchParams } = new URL(request.url);
  const includeCancelled = searchParams.get('includeCancelled') === '1' || searchParams.get('includeCancelled') === 'true';

  let query = supabase
    .from('bookings')
    .select(`
      id, service_id, professional_id, customer_id, starts_at, ends_at, status, payment_status, amount_clp,
      customers(name, email, phone, plan_name, membership_status),
      services(name, class_type, capacity),
      professionals(name, color, email, phone)
    `)
    .eq('business_id', business.id)
    .order('starts_at', { ascending: true });

  if (!includeCancelled) {
    query = query.neq('status', 'cancelled');
  }

  const { data: bookings, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count enrolled students per service and starts_at slot
  const countMap = new Map<string, number>();
  for (const b of (bookings || [])) {
    if (b.status !== 'cancelled') {
      const key = `${b.service_id}_${b.starts_at}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }
  }

  const mapped = (bookings || []).map((b: any) => ({
    id: b.id,
    service_id: b.service_id,
    professional_id: b.professional_id,
    customer_id: b.customer_id,
    starts_at: Math.floor(new Date(b.starts_at).getTime() / 1000),
    ends_at: Math.floor(new Date(b.ends_at).getTime() / 1000),
    status: b.status,
    payment_status: b.payment_status,
    amount_clp: b.amount_clp,
    customer_name: b.customers?.name || 'Alumno',
    customer_email: b.customers?.email || '',
    customer_phone: b.customers?.phone || '',
    plan_name: b.customers?.plan_name || 'Regular',
    membership_status: b.customers?.membership_status || 'active',
    service_name: b.services?.name || 'Clase',
    class_type: b.services?.class_type || 'individual',
    capacity: b.services?.capacity || 1,
    professional_name: b.professionals?.name || 'Instructor',
    professional_color: b.professionals?.color || '#7559f2',
    professional_email: b.professionals?.email || '',
    professional_phone: b.professionals?.phone || '',
    enrolled_count: countMap.get(`${b.service_id}_${b.starts_at}`) || 1,
  }));

  return NextResponse.json({ bookings: mapped });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  const customerName = String(input.customerName ?? '').trim();
  const customerEmail = String(input.customerEmail ?? '').trim().toLowerCase();
  const customerPhone = String(input.customerPhone ?? '').trim();
  const customerIdInput = input.customerId ? Number(input.customerId) : null;
  const serviceId = Number(input.serviceId);
  const professionalId = Number(input.professionalId);
  const date = String(input.date ?? '');
  const time = String(input.time ?? '');
  const notes = String(input.notes ?? '').trim();

  if (!Number.isInteger(serviceId) || !Number.isInteger(professionalId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Completa correctamente la fecha, hora, clase e instructor.' }, { status: 400 });
  }

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const { data: serviceRow } = await supabase
    .from('services')
    .select('id, name, class_type, capacity, duration_minutes, price_clp')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();

  if (!serviceRow) return NextResponse.json({ error: 'La clase no existe o está pausada.' }, { status: 400 });

  const { data: professional } = await supabase
    .from('professionals')
    .select('id, name, email, phone')
    .eq('id', professionalId)
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();

  if (!professional) return NextResponse.json({ error: 'El instructor no existe o no está activo.' }, { status: 400 });

  const start = new Date(`${date}T${time}:00-04:00`);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Fecha u hora inválida.' }, { status: 400 });
  const startsAtIso = start.toISOString();
  const ends = new Date(start.getTime() + serviceRow.duration_minutes * 60 * 1000);
  const endsAtIso = ends.toISOString();

  // Check capacity limit
  const { count: enrolledCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', serviceRow.id)
    .eq('starts_at', startsAtIso)
    .neq('status', 'cancelled');

  const currentEnrolled = enrolledCount ?? 0;
  const maxCapacity = serviceRow.class_type === 'grupal' ? (serviceRow.capacity || 10) : 1;

  if (currentEnrolled >= maxCapacity) {
    return NextResponse.json({
      error: `¡Cupos agotados! Esta clase tiene una capacidad máxima de ${maxCapacity} alumnos y ya cuenta con ${currentEnrolled} inscritos.`,
    }, { status: 409 });
  }

  // Check conflict: instructor cannot teach another class at the same time
  const { data: conflict } = await supabase
    .from('bookings')
    .select('id')
    .eq('professional_id', professional.id)
    .neq('service_id', serviceRow.id)
    .neq('status', 'cancelled')
    .lt('starts_at', endsAtIso)
    .gt('ends_at', startsAtIso)
    .limit(1)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: 'El instructor ya tiene otra clase agendada en ese mismo bloque horario.' }, { status: 409 });
  }

  // Resolve Customer
  let customerId = customerIdInput;
  if (!customerId) {
    if (!customerName || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      return NextResponse.json({ error: 'Ingresa nombre y correo válidos del alumno.' }, { status: 400 });
    }
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', business.id)
      .ilike('email', customerEmail)
      .maybeSingle();

    if (!existing) {
      const nextDue = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
      const { data: createdCust } = await supabase
        .from('customers')
        .insert({
          business_id: business.id,
          name: customerName,
          email: customerEmail,
          phone: customerPhone || null,
          notes: notes || null,
          plan_name: 'Mensualidad Regular',
          monthly_fee: 35000,
          payment_due_day: 5,
          membership_status: 'active',
          next_payment_due: nextDue,
          notify_email: true,
          notify_whatsapp: true,
        })
        .select('id')
        .single();
      customerId = createdCust?.id;
    } else {
      customerId = existing.id;
      if (customerPhone) {
        await supabase.from('customers').update({ phone: customerPhone }).eq('id', customerId);
      }
    }
  }

  if (!customerId) return NextResponse.json({ error: 'Error al asociar alumno.' }, { status: 500 });

  // Check if student is already booked for this exact session
  const { data: alreadyBooked } = await supabase
    .from('bookings')
    .select('id')
    .eq('service_id', serviceRow.id)
    .eq('customer_id', customerId)
    .eq('starts_at', startsAtIso)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (alreadyBooked) {
    return NextResponse.json({ error: 'Este alumno ya está inscrito en esta clase.' }, { status: 409 });
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, email, membership_status')
    .eq('id', customerId)
    .single();

  const isIncludedInPlan = customer?.membership_status === 'active';
  const paymentStatus = isIncludedInPlan ? 'paid' : 'unpaid';

  const { data: inserted, error: insertError } = await supabase
    .from('bookings')
    .insert({
      business_id: business.id,
      service_id: serviceRow.id,
      professional_id: professional.id,
      customer_id: customerId,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      status: 'confirmed',
      payment_status: paymentStatus,
      amount_clp: serviceRow.price_clp,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || 'Error al guardar reserva.' }, { status: 500 });
  }

  const newEnrolled = currentEnrolled + 1;
  const classDateStr = start.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const classTimeStr = start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  if (customer) {
    const confirmMsg = `Hola ${customer.name}! Tu cupo para la clase de ${serviceRow.name} con ${professional.name} ha sido confirmado para el ${classDateStr} a las ${classTimeStr}. Cupo asegurado: ${newEnrolled}/${maxCapacity}.`;
    await supabase.from('notifications').insert({
      business_id: business.id,
      customer_id: customer.id,
      type: 'booking_confirmed',
      channel: customer.phone ? 'whatsapp' : 'email',
      recipient: customer.phone || customer.email,
      subject: 'Cupo Confirmado',
      message: confirmMsg,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    id: inserted.id,
    message: `Inscripción confirmada (${newEnrolled}/${maxCapacity} cupos ocupados).`,
    enrolled: newEnrolled,
    capacity: maxCapacity,
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  const status = body.status ? String(body.status) : undefined;
  const paymentStatus = body.paymentStatus ? String(body.paymentStatus) : undefined;
  const date = body.date ? String(body.date) : undefined;
  const time = body.time ? String(body.time) : undefined;

  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Reserva inválida.' }, { status: 400 });
  }

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const updatePayload: Record<string, unknown> = {};
  if (status) updatePayload.status = status;
  if (paymentStatus) updatePayload.payment_status = paymentStatus;

  if (date && time) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, services(duration_minutes)')
      .eq('id', id)
      .eq('business_id', business.id)
      .maybeSingle();

    if (!booking) return NextResponse.json({ error: 'Reserva no encontrada.' }, { status: 404 });

    const start = new Date(`${date}T${time}:00-04:00`);
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Fecha u hora inválida.' }, { status: 400 });
    const duration = (booking.services as any)?.duration_minutes || 60;
    const ends = new Date(start.getTime() + duration * 60 * 1000);

    updatePayload.starts_at = start.toISOString();
    updatePayload.ends_at = ends.toISOString();
  }

  const { error } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', id)
    .eq('business_id', business.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    message: date && time ? 'Reserva reagendada correctamente.' : 'Estado de la reserva actualizado correctamente.',
  });
}

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  let id: number | null = null;
  const { searchParams } = new URL(request.url);
  const queryId = searchParams.get('id');
  if (queryId) {
    id = Number(queryId);
  } else {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      id = Number(body.id);
    } catch {}
  }

  if (!id || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'ID de reserva inválido.' }, { status: 400 });
  }

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const { error } = await supabase.from('bookings').delete().eq('id', id).eq('business_id', business.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: 'Reserva eliminada correctamente.' });
}

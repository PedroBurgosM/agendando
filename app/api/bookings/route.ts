import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';
import { parseChileDateTime } from '../../lib/dates';
import { getBusinessForUser } from '../../lib/tenant';
import { calculateRecurringSessions, isMonthlyPlan } from '../../lib/recurring';

async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

async function getBusiness(supabase: any, user: any, request?: Request) {
  const bId = request?.headers?.get('x-business-id');
  return getBusinessForUser(supabase, user, true, bId ? Number(bId) : null);
}

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user, request);
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

  const business = await getBusiness(supabase, user, request);
  if (!business) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const { data: serviceRow } = await supabase
    .from('services')
    .select('id, name, class_type, capacity, duration_minutes, price_clp, billing_period, schedule')
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

  // Resolve Customer first
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

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, email, membership_status')
    .eq('id', customerId)
    .single();

  const isIncludedInPlan = customer?.membership_status === 'active';
  const paymentStatus = isIncludedInPlan ? 'paid' : 'unpaid';

  const isMonthly = isMonthlyPlan(serviceRow.billing_period, serviceRow.name);
  if (!isMonthly) {
    const firstDt = parseChileDateTime(date, time);
    if (!Number.isNaN(firstDt.getTime()) && firstDt.getTime() < Date.now() - 5 * 60 * 1000) {
      return NextResponse.json({
        error: 'No se pueden agendar reservas en fechas u horarios pasados.',
      }, { status: 400 });
    }
  }

  // Generate all recurring sessions for this service pack / schedule
  const sessionsToCreate = calculateRecurringSessions({
    serviceName: serviceRow.name,
    billingPeriod: serviceRow.billing_period,
    schedule: serviceRow.schedule,
    startDate: date,
    startTime: time,
  });

  const durationMs = serviceRow.duration_minutes * 60 * 1000;
  const maxCapacity = serviceRow.class_type === 'grupal' ? (serviceRow.capacity || 10) : 1;

  // Validate each session and filter out already-booked or conflicting slots
  const validSessions: Array<{ startsAtIso: string; endsAtIso: string; start: Date }> = [];
  let skippedDueToDoubleBooking = 0;

  for (const s of sessionsToCreate) {
    const sStart = parseChileDateTime(s.date, s.time);
    if (Number.isNaN(sStart.getTime())) continue;
    const sStartsAtIso = sStart.toISOString();
    const sEndsAtIso = new Date(sStart.getTime() + durationMs).toISOString();

    // 1. Verificar si el alumno ya tiene una clase agendada que se solape con este horario
    const { data: studentOverlap } = await supabase
      .from('bookings')
      .select('id, starts_at, ends_at, services(name)')
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')
      .lt('starts_at', sEndsAtIso)
      .gt('ends_at', sStartsAtIso)
      .limit(1)
      .maybeSingle();

    if (studentOverlap) {
      if (sessionsToCreate.length === 1) {
        return NextResponse.json({
          error: `El alumno ya tiene una clase agendada en ese horario (${(studentOverlap as any).services?.name || 'Clase'}).`,
        }, { status: 409 });
      }
      skippedDueToDoubleBooking++;
      continue;
    }

    // 2. Verificar disponibilidad del horario con el instructor (no permitir sobreponer horarios tomados)
    const { data: instructorOverlaps } = await supabase
      .from('bookings')
      .select('id, service_id, starts_at, ends_at, services(name, class_type, capacity)')
      .eq('professional_id', professional.id)
      .neq('status', 'cancelled')
      .lt('starts_at', sEndsAtIso)
      .gt('ends_at', sStartsAtIso);

    const activeOverlaps = instructorOverlaps || [];

    if (activeOverlaps.length > 0) {
      // Si la clase es individual (o capacidad 1), cualquier reserva previa significa que el horario está tomado
      if (serviceRow.class_type === 'individual' || maxCapacity === 1) {
        if (sessionsToCreate.length === 1) {
          const takenClassName = (activeOverlaps[0] as any)?.services?.name || 'otra clase';
          return NextResponse.json({
            error: `El horario de las ${s.time} hrs ya se encuentra tomado con el instructor (${takenClassName}). No es posible asignar otra clase en el mismo bloque.`,
          }, { status: 409 });
        }
        continue;
      }

      // Si la clase es grupal: no permitir mezclar con otras clases en el mismo bloque
      const hasForeignClass = activeOverlaps.some(b => b.service_id !== serviceRow.id || b.starts_at !== sStartsAtIso);
      if (hasForeignClass) {
        if (sessionsToCreate.length === 1) {
          return NextResponse.json({
            error: 'El instructor ya tiene otra clase agendada en ese mismo bloque horario.',
          }, { status: 409 });
        }
        continue;
      }

      // Verificar capacidad de la clase grupal
      if (activeOverlaps.length >= maxCapacity) {
        if (sessionsToCreate.length === 1) {
          return NextResponse.json({
            error: `¡Cupos agotados! Esta clase tiene una capacidad máxima de ${maxCapacity} alumnos y ya cuenta con ${activeOverlaps.length} inscritos.`,
          }, { status: 409 });
        }
        continue;
      }
    }

    validSessions.push({ startsAtIso: sStartsAtIso, endsAtIso: sEndsAtIso, start: sStart });
  }

  if (validSessions.length === 0) {
    if (skippedDueToDoubleBooking > 0) {
      return NextResponse.json({ error: 'El alumno ya se encuentra inscrito en las fechas de esta clase.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No fue posible asignar cupos en las fechas del plan (horarios copados o en conflicto).' }, { status: 409 });
  }

  const amountPerSession = Math.round(serviceRow.price_clp / validSessions.length);
  const rowsToInsert = validSessions.map((s, idx) => ({
    business_id: business.id,
    service_id: serviceRow.id,
    professional_id: professional.id,
    customer_id: customerId,
    starts_at: s.startsAtIso,
    ends_at: s.endsAtIso,
    status: 'confirmed',
    payment_status: paymentStatus,
    amount_clp: idx === 0
      ? serviceRow.price_clp - (amountPerSession * (validSessions.length - 1))
      : amountPerSession,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from('bookings')
    .insert(rowsToInsert)
    .select('id');

  if (insertError || !insertedRows) {
    return NextResponse.json({ error: insertError?.message || 'Error al guardar reserva.' }, { status: 500 });
  }

  const upcomingSessions = validSessions.filter(s => s.start.getTime() >= Date.now() - 5 * 60 * 1000);
  const firstUpcomingSession = upcomingSessions.length > 0 ? upcomingSessions[0] : validSessions[0];
  const classDateStr = firstUpcomingSession.start.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const classTimeStr = firstUpcomingSession.start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  if (customer) {
    const confirmMsg = validSessions.length > 1
      ? `Hola ${customer.name}! Tu inscripción para ${serviceRow.name} con ${professional.name} ha sido confirmada para todas sus ${validSessions.length} clases del mes. Tu próxima sesión es el ${classDateStr} a las ${classTimeStr}.`
      : `Hola ${customer.name}! Tu cupo para la clase de ${serviceRow.name} con ${professional.name} ha sido confirmado para el ${classDateStr} a las ${classTimeStr}.`;

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
    booking: insertedRows[0],
    bookingsCount: validSessions.length,
    message: validSessions.length > 1
      ? `Se inscribió al alumno en las ${validSessions.length} clases del mes correctamente.`
      : 'Inscripción confirmada.',
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

  const business = await getBusiness(supabase, user, request);
  if (!business) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const updatePayload: Record<string, unknown> = {};
  if (status) {
    let normalizedStatus = status;
    if (status === 'attended') normalizedStatus = 'completed';
    else if (status === 'absent') normalizedStatus = 'no_show';
    updatePayload.status = normalizedStatus;
  }
  if (paymentStatus) updatePayload.payment_status = paymentStatus;

  if (date && time) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, professional_id, customer_id, service_id, services(id, name, duration_minutes, class_type, capacity)')
      .eq('id', id)
      .eq('business_id', business.id)
      .maybeSingle();

    if (!booking) return NextResponse.json({ error: 'Reserva no encontrada.' }, { status: 404 });

    const start = parseChileDateTime(date, time);
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Fecha u hora inválida.' }, { status: 400 });
    if (start.getTime() < Date.now() - 5 * 60 * 1000) {
      return NextResponse.json({ error: 'No se puede reagendar a una fecha u hora pasada.' }, { status: 400 });
    }
    const sService = booking.services as any;
    const duration = sService?.duration_minutes || 60;
    const ends = new Date(start.getTime() + duration * 60 * 1000);
    const startIso = start.toISOString();
    const endsIso = ends.toISOString();

    // 1. Validar conflicto del alumno
    const { data: studentOverlap } = await supabase
      .from('bookings')
      .select('id, services(name)')
      .eq('customer_id', booking.customer_id)
      .neq('id', id)
      .neq('status', 'cancelled')
      .lt('starts_at', endsIso)
      .gt('ends_at', startIso)
      .limit(1)
      .maybeSingle();

    if (studentOverlap) {
      return NextResponse.json({
        error: `El alumno ya tiene otra clase agendada en ese horario (${(studentOverlap as any).services?.name || 'Clase'}).`,
      }, { status: 409 });
    }

    // 2. Validar conflicto del instructor (no permitir sobreponer horarios tomados)
    const { data: instructorOverlaps } = await supabase
      .from('bookings')
      .select('id, service_id, starts_at, ends_at, services(name, class_type, capacity)')
      .eq('professional_id', booking.professional_id)
      .neq('id', id)
      .neq('status', 'cancelled')
      .lt('starts_at', endsIso)
      .gt('ends_at', startIso);

    const activeOverlaps = instructorOverlaps || [];
    const maxCap = sService?.class_type === 'grupal' ? (sService?.capacity || 10) : 1;

    if (activeOverlaps.length > 0) {
      if (sService?.class_type === 'individual' || maxCap === 1) {
        const takenName = (activeOverlaps[0] as any)?.services?.name || 'otra clase';
        return NextResponse.json({
          error: `El horario de las ${time} hrs ya se encuentra tomado con el instructor (${takenName}). No es posible sobreponer otra clase en el mismo bloque.`,
        }, { status: 409 });
      }

      const hasForeignClass = activeOverlaps.some(b => b.service_id !== booking.service_id || b.starts_at !== startIso);
      if (hasForeignClass) {
        return NextResponse.json({
          error: `El instructor ya está asignado a otra actividad en ese bloque horario.`,
        }, { status: 409 });
      }

      if (activeOverlaps.length >= maxCap) {
        return NextResponse.json({
          error: `No hay cupos disponibles en ese horario grupal (Capacidad máxima: ${maxCap}).`,
        }, { status: 409 });
      }
    }

    updatePayload.starts_at = startIso;
    updatePayload.ends_at = endsIso;
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

  const business = await getBusiness(supabase, user, request);
  if (!business) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const { error } = await supabase.from('bookings').delete().eq('id', id).eq('business_id', business.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: 'Reserva eliminada correctamente.' });
}

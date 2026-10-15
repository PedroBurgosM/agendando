import { NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';
import { parseChileDateTime } from '../../../lib/dates';
import { calculateRecurringSessions } from '../../../lib/recurring';

export async function GET(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('negocio') || searchParams.get('slug');

  let business = null;
  if (slug) {
    const { data: b } = await supabase
      .from('businesses')
      .select('id, name, email, phone, address, description, timezone, currency, cancellation_hours, booking_window_days')
      .eq('slug', slug)
      .maybeSingle();
    business = b;
  }

  if (!business) {
    const { data: defaultBiz } = await supabase
      .from('businesses')
      .select('id, name, email, phone, address, description, timezone, currency, cancellation_hours, booking_window_days')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    business = defaultBiz;
  }

  if (!business) return NextResponse.json({ error: 'Página no disponible.' }, { status: 404 });

  const [servicesRes, teamRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, mode, class_type, capacity, billing_period, schedule, duration_minutes, price_clp, deposit_percent')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('name', { ascending: true }),
    supabase
      .from('professionals')
      .select('id, name, role, color')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  const teamList = teamRes.data || [];
  const profMap = new Map<number, string>(teamList.map((p: any) => [p.id, p.name]));

  const mappedServices = (servicesRes.data || []).map((s: any) => {
    const descStr = s.description || '';
    const match = descStr.match(/<!--instructor:(\d+)-->/);
    const instructorId = match ? Number(match[1]) : null;
    const instructorName = instructorId ? (profMap.get(instructorId) || null) : null;
    const showInstructor = !descStr.includes('<!--show_instructor:false-->');
    const showSchedule = !descStr.includes('<!--show_schedule:false-->');
    const scheduleMode = descStr.includes('<!--schedule_mode:flexible-->') ? 'flexible' : (s.schedule && s.schedule !== 'null' ? 'fixed' : 'flexible');
    const cleanDescription = descStr.replace(/<!--[\s\S]*?-->/g, '').trim() || null;
    const cleanSchedule = (s.schedule && s.schedule !== 'null' && s.schedule !== 'undefined' && s.schedule.trim() !== '') ? s.schedule.trim() : null;

    return {
      ...s,
      description: cleanDescription,
      schedule: cleanSchedule,
      instructor_id: instructorId,
      instructor_name: instructorName,
      show_instructor: showInstructor,
      show_schedule: showSchedule,
      schedule_mode: scheduleMode,
    };
  });

  return NextResponse.json({
    business,
    services: mappedServices,
    team: teamList,
  });
}

// Rate Limiter en memoria para reservas públicas: máximo 5 reservas cada 10 minutos por IP
const publicBookingAttempts = new Map<string, { count: number; resetAt: number }>();

function checkPublicBookingRateLimit(ip: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  if (publicBookingAttempts.size > 1000) {
    for (const [key, val] of publicBookingAttempts.entries()) {
      if (now > val.resetAt) publicBookingAttempts.delete(key);
    }
  }

  const entry = publicBookingAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (now > entry.resetAt) {
    publicBookingAttempts.delete(ip);
    return { allowed: true };
  }
  if (entry.count >= 5) {
    const waitMinutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
    return { allowed: false, waitMinutes };
  }
  return { allowed: true };
}

function recordPublicBookingAttempt(ip: string) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutos
  const entry = publicBookingAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    publicBookingAttempts.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
}

export async function POST(request: Request) {
  // Verificación de Rate Limiting por IP para evitar spam o ataques DoS de reservas
  const forwardedHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip');
  const clientIp = forwardedHeader ? forwardedHeader.split(',')[0].trim() : '127.0.0.1';

  const rateCheck = checkPublicBookingRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Has superado el límite de reservas permitidas. Por seguridad, espera ${rateCheck.waitMinutes} minuto(s) antes de intentar de nuevo.` },
      { status: 429 }
    );
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  recordPublicBookingAttempt(clientIp);

  const x = (await request.json()) as Record<string, unknown>;
  const slug = (x.slug || x.negocio) as string | undefined;

  let business = null;
  if (slug) {
    const { data: b } = await supabase
      .from('businesses')
      .select('id, booking_window_days')
      .eq('slug', slug)
      .maybeSingle();
    business = b;
  }

  if (!business) {
    const { data: defaultBiz } = await supabase
      .from('businesses')
      .select('id, booking_window_days')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    business = defaultBiz;
  }

  if (!business) return NextResponse.json({ error: 'Página no disponible.' }, { status: 404 });

  const name = String(x.customerName ?? '').trim();
  const email = String(x.customerEmail ?? '').trim().toLowerCase();
  const phone = String(x.customerPhone ?? '').trim();
  const date = String(x.date ?? '');
  const rawTime = String(x.time ?? '').trim();
  const timePreference = String(x.timePreference ?? x.time_preference ?? '').trim();
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '10:00';
  const serviceId = Number(x.serviceId);
  const professionalId = Number(x.professionalId);

  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(serviceId) || !Number.isInteger(professionalId)) {
    return NextResponse.json({ error: 'Completa correctamente tus datos.' }, { status: 400 });
  }

  const { data: service } = await supabase
    .from('services')
    .select('id, name, description, class_type, capacity, duration_minutes, price_clp, billing_period, schedule')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();

  const { data: professional } = await supabase
    .from('professionals')
    .select('id, name, email, phone')
    .eq('id', professionalId)
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();

  if (!service || !professional) return NextResponse.json({ error: 'Clase o instructor no disponible.' }, { status: 400 });

  let { data: customer } = await supabase
    .from('customers')
    .select('id, membership_status')
    .eq('business_id', business.id)
    .ilike('email', email)
    .maybeSingle();

  if (!customer) {
    const nextDue = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const { data: createdCust } = await supabase
      .from('customers')
      .insert({
        business_id: business.id,
        name,
        email,
        phone: phone || null,
        plan_name: 'Mensualidad Regular',
        monthly_fee: 35000,
        payment_due_day: 5,
        membership_status: 'active',
        next_payment_due: nextDue,
        notify_email: true,
        notify_whatsapp: true,
      })
      .select('id, membership_status')
      .single();
    customer = createdCust;
  } else if (phone) {
    await supabase.from('customers').update({ name, phone }).eq('id', customer.id);
  }

  if (!customer) return NextResponse.json({ error: 'Error al asociar alumno.' }, { status: 500 });

  // Generate all recurring sessions for this service pack
  const sessionsToCreate = calculateRecurringSessions({
    serviceName: service.name,
    billingPeriod: service.billing_period,
    schedule: service.schedule,
    startDate: date,
    startTime: time,
  });

  const durationMs = service.duration_minutes * 60 * 1000;
  const maxCapacity = service.class_type === 'grupal' ? (service.capacity || 10) : 1;

  const validSessions: Array<{ startsAtIso: string; endsAtIso: string; start: Date }> = [];
  let alreadyBookedCount = 0;

  for (const s of sessionsToCreate) {
    const sStart = parseChileDateTime(s.date, s.time);
    if (Number.isNaN(sStart.getTime())) continue;
    const sStartsAtIso = sStart.toISOString();
    const sEndsAtIso = new Date(sStart.getTime() + durationMs).toISOString();

    // Check if student is already booked
    const { data: alreadyBooked } = await supabase
      .from('bookings')
      .select('id')
      .eq('service_id', service.id)
      .eq('customer_id', customer.id)
      .eq('starts_at', sStartsAtIso)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (alreadyBooked) {
      alreadyBookedCount++;
      continue;
    }

    // 1. Verificar si el alumno ya tiene clase en ese horario
    const { data: studentOverlap } = await supabase
      .from('bookings')
      .select('id, starts_at, ends_at, services(name)')
      .eq('customer_id', customer.id)
      .neq('status', 'cancelled')
      .lt('starts_at', sEndsAtIso)
      .gt('ends_at', sStartsAtIso)
      .limit(1)
      .maybeSingle();

    if (studentOverlap) {
      if (sessionsToCreate.length === 1) {
        return NextResponse.json({
          error: `Ya tienes otra clase reservada en este mismo horario (${(studentOverlap as any).services?.name || 'Clase'}).`,
        }, { status: 409 });
      }
      alreadyBookedCount++;
      continue;
    }

    // 2. Verificar disponibilidad del instructor (horario tomado)
    const { data: instructorOverlaps } = await supabase
      .from('bookings')
      .select('id, service_id, starts_at, ends_at, services(name, class_type, capacity)')
      .eq('professional_id', professional.id)
      .neq('status', 'cancelled')
      .lt('starts_at', sEndsAtIso)
      .gt('ends_at', sStartsAtIso);

    const activeOverlaps = instructorOverlaps || [];

    if (activeOverlaps.length > 0) {
      if (service.class_type === 'individual' || maxCapacity === 1) {
        if (sessionsToCreate.length === 1) {
          return NextResponse.json({
            error: `El horario de las ${s.time} hrs ya se encuentra tomado con este instructor. Por favor selecciona otro horario.`,
          }, { status: 409 });
        }
        continue;
      }

      const hasForeignClass = activeOverlaps.some(b => b.service_id !== service.id || b.starts_at !== sStartsAtIso);
      if (hasForeignClass) {
        if (sessionsToCreate.length === 1) {
          return NextResponse.json({
            error: 'El instructor ya tiene otra clase agendada en ese horario. Por favor elige otro horario.',
          }, { status: 409 });
        }
        continue;
      }

      if (activeOverlaps.length >= maxCapacity) {
        if (sessionsToCreate.length === 1) {
          return NextResponse.json({
            error: `¡Lo sentimos! Esta clase ya completó su cupo máximo permitido (${maxCapacity} alumnos). Por favor selecciona otro horario.`,
          }, { status: 409 });
        }
        continue;
      }
    }

    validSessions.push({ startsAtIso: sStartsAtIso, endsAtIso: sEndsAtIso, start: sStart });
  }

  if (validSessions.length === 0) {
    if (alreadyBookedCount > 0) {
      return NextResponse.json({ error: 'Ya te encuentras registrado en las fechas de esta clase.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No hay cupos disponibles en las fechas solicitadas.' }, { status: 409 });
  }

  const paymentStatus = customer.membership_status === 'active' ? 'paid' : 'unpaid';
  const amountPerSession = Math.round(service.price_clp / validSessions.length);

  const rowsToInsert = validSessions.map((s, idx) => ({
    business_id: business.id,
    service_id: service.id,
    professional_id: professional.id,
    customer_id: customer.id,
    starts_at: s.startsAtIso,
    ends_at: s.endsAtIso,
    status: 'confirmed',
    payment_status: paymentStatus,
    amount_clp: idx === 0
      ? service.price_clp - (amountPerSession * (validSessions.length - 1))
      : amountPerSession,
  }));

  const { data: insertedList, error: bookingErr } = await supabase
    .from('bookings')
    .insert(rowsToInsert)
    .select('id');

  if (bookingErr || !insertedList) {
    return NextResponse.json({ error: bookingErr?.message || 'Error al guardar la reserva.' }, { status: 500 });
  }

  const descStr = service.description || '';
  const isFlexible = descStr.includes('<!--schedule_mode:flexible-->') || !service.schedule || service.schedule === 'null';

  const upcomingSessions = validSessions.filter(s => s.start.getTime() >= Date.now() - 5 * 60 * 1000);
  const firstUpcomingSession = upcomingSessions.length > 0 ? upcomingSessions[0] : validSessions[0];
  const classDateStr = firstUpcomingSession.start.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const classTimeStr = firstUpcomingSession.start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  
  const confirmMsg = isFlexible
    ? `¡Hola ${name}! Tu solicitud para ${service.name} ha sido recibida con éxito. El horario de tus clases será coordinado directamente contigo por tu instructor a tu teléfono/WhatsApp (${phone}).`
    : (validSessions.length > 1
        ? `¡Hola ${name}! Tu cupo para las ${validSessions.length} clases del mes de ${service.name} con ${professional.name} ha sido reservado con éxito. Tu próxima clase es el ${classDateStr} a las ${classTimeStr}.`
        : `¡Hola ${name}! Tu cupo para la clase de ${service.name} con ${professional.name} ha sido reservado para el ${classDateStr} a las ${classTimeStr}.`);

  await supabase.from('notifications').insert({
    business_id: business.id,
    customer_id: customer.id,
    type: 'booking_confirmed',
    channel: phone ? 'whatsapp' : 'email',
    recipient: phone || email,
    subject: isFlexible ? 'Solicitud Recibida - Horario a Coordinar' : 'Cupo Confirmado',
    message: confirmMsg,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  const booking = insertedList[0];

  if (professional && (professional.email || professional.phone)) {
    const profMsg = isFlexible
      ? `¡Hola ${professional.name}! Tienes una nueva solicitud para tu clase ${service.name} (Horario a coordinar). Alumno: ${name} (${phone || email})${timePreference ? ` - Preferencia: ${timePreference}` : ''}. Comunícate con él para acordar los horarios.`
      : (validSessions.length > 1
          ? `¡Hola ${professional.name}! Tienes una nueva inscripción para tu clase de ${service.name} (${validSessions.length} clases del mes). Próxima clase: ${classDateStr} a las ${classTimeStr}. Alumno: ${name} (${phone || email}).`
          : `¡Hola ${professional.name}! Tienes una nueva reserva para tu clase de ${service.name} el ${classDateStr} a las ${classTimeStr}. Alumno: ${name} (${phone || email}).`);

    await supabase.from('notifications').insert({
      business_id: business.id,
      customer_id: null,
      type: 'booking_confirmed',
      channel: professional.phone ? 'whatsapp' : 'email',
      recipient: professional.phone || professional.email,
      subject: isFlexible ? 'Nueva Solicitud (Horario a Coordinar)' : 'Nueva Reserva para tu Clase',
      message: profMsg,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
  }

  const studentCleanPhone = phone.replace(/\D/g, '');
  const studentNormalizedPhone = studentCleanPhone.length === 9 ? `56${studentCleanPhone}` : studentCleanPhone;
  const studentWaUrl = studentNormalizedPhone ? `https://wa.me/${studentNormalizedPhone}?text=${encodeURIComponent(confirmMsg)}` : null;

  return NextResponse.json({
    id: booking.id,
    bookingId: booking.id,
    bookingsCount: validSessions.length,
    isFlexible,
    message: isFlexible
      ? '¡Solicitud recibida! Te contactaremos para coordinar tu horario.'
      : (validSessions.length > 1
          ? `¡Tus ${validSessions.length} clases del mes quedaron reservadas con éxito!`
          : '¡Tu cupo quedó asegurado!'),
    serviceName: service.name,
    professionalName: professional.name,
    classDateStr: isFlexible ? `A partir del ${date}` : classDateStr,
    classTimeStr: isFlexible ? (timePreference || 'Horario a convenir con instructor') : classTimeStr,
    studentWaUrl,
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
  }, { status: 201 });
}

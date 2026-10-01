import { NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, email, phone, address, description, timezone, currency, cancellation_hours, booking_window_days')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

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

  return NextResponse.json({
    business,
    services: servicesRes.data || [],
    team: teamRes.data || [],
  });
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const x = (await request.json()) as Record<string, unknown>;
  const { data: business } = await supabase
    .from('businesses')
    .select('id, booking_window_days')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) return NextResponse.json({ error: 'Página no disponible.' }, { status: 404 });

  const name = String(x.customerName ?? '').trim();
  const email = String(x.customerEmail ?? '').trim().toLowerCase();
  const phone = String(x.customerPhone ?? '').trim();
  const date = String(x.date ?? '');
  const time = String(x.time ?? '');
  const serviceId = Number(x.serviceId);
  const professionalId = Number(x.professionalId);

  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !Number.isInteger(serviceId) || !Number.isInteger(professionalId)) {
    return NextResponse.json({ error: 'Completa correctamente tus datos.' }, { status: 400 });
  }

  const { data: service } = await supabase
    .from('services')
    .select('id, name, class_type, capacity, duration_minutes, price_clp')
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

  const start = new Date(`${date}T${time}:00-04:00`);
  const startsAtIso = start.toISOString();
  const ends = new Date(start.getTime() + service.duration_minutes * 60 * 1000);
  const endsAtIso = ends.toISOString();

  const now = new Date();
  const maxWindow = new Date(now.getTime() + (business.booking_window_days || 60) * 86400 * 1000);
  if (start < now || start > maxWindow) {
    return NextResponse.json({ error: 'La fecha está fuera del período permitido.' }, { status: 400 });
  }

  // Capacity check
  const { count: enrolledCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', service.id)
    .eq('starts_at', startsAtIso)
    .neq('status', 'cancelled');

  const currentEnrolled = enrolledCount ?? 0;
  const maxCapacity = service.class_type === 'grupal' ? (service.capacity || 10) : 1;

  if (currentEnrolled >= maxCapacity) {
    return NextResponse.json({
      error: `¡Lo sentimos! Esta clase ya completó su cupo máximo permitido (${maxCapacity} alumnos). Por favor selecciona otro horario.`,
    }, { status: 409 });
  }

  // Conflict check for instructor
  const { data: conflict } = await supabase
    .from('bookings')
    .select('id')
    .eq('professional_id', professional.id)
    .neq('service_id', service.id)
    .neq('status', 'cancelled')
    .lt('starts_at', endsAtIso)
    .gt('ends_at', startsAtIso)
    .limit(1)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: 'El instructor ya tiene otra clase agendada en ese horario. Por favor elige otro horario.' }, { status: 409 });
  }

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

  // Prevent double enrollment
  const { data: alreadyBooked } = await supabase
    .from('bookings')
    .select('id')
    .eq('service_id', service.id)
    .eq('customer_id', customer.id)
    .eq('starts_at', startsAtIso)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (alreadyBooked) {
    return NextResponse.json({ error: 'Ya te encuentras registrado en esta clase.' }, { status: 409 });
  }

  const paymentStatus = customer.membership_status === 'active' ? 'paid' : 'unpaid';

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      business_id: business.id,
      service_id: service.id,
      professional_id: professional.id,
      customer_id: customer.id,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      status: 'confirmed',
      payment_status: paymentStatus,
      amount_clp: service.price_clp,
    })
    .select('id')
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: bookingErr?.message || 'Error al guardar la reserva.' }, { status: 500 });
  }

  const enrolledNow = currentEnrolled + 1;
  const classDateStr = start.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const classTimeStr = start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const confirmMsg = `¡Hola ${name}! Tu cupo para la clase de ${service.name} con ${professional.name} ha sido reservado para el ${classDateStr} a las ${classTimeStr}. (${enrolledNow}/${maxCapacity} cupos).`;

  await supabase.from('notifications').insert({
    business_id: business.id,
    customer_id: customer.id,
    type: 'booking_confirmed',
    channel: phone ? 'whatsapp' : 'email',
    recipient: phone || email,
    subject: 'Cupo Confirmado',
    message: confirmMsg,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  if (professional && (professional.email || professional.phone)) {
    const profMsg = `¡Hola ${professional.name}! Tienes una nueva reserva para tu clase de ${service.name} el ${classDateStr} a las ${classTimeStr}. Alumno: ${name} (${phone || email}). Cupos: ${enrolledNow}/${maxCapacity}.`;
    await supabase.from('notifications').insert({
      business_id: business.id,
      customer_id: null,
      type: 'booking_confirmed',
      channel: professional.phone ? 'whatsapp' : 'email',
      recipient: professional.phone || professional.email,
      subject: 'Nueva Reserva para tu Clase',
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
    message: `¡Tu cupo quedó asegurado! (${enrolledNow}/${maxCapacity} inscritos).`,
    serviceName: service.name,
    professionalName: professional.name,
    classDateStr,
    classTimeStr,
    studentWaUrl,
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
  }, { status: 201 });
}

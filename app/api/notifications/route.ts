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

function cleanPhone(p: string | null | undefined): string {
  if (!p) return '';
  let cleaned = p.replace(/[^\d]/g, '');
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    cleaned = '56' + cleaned;
  }
  return cleaned;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ notifications: [] });

  const url = new URL(request.url);
  const customerId = url.searchParams.get('customerId');

  let query = supabase
    .from('notifications')
    .select(`
      id, business_id, customer_id, type, channel, recipient,
      subject, message, status, scheduled_for, sent_at, created_at,
      customers(name)
    `)
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (customerId && !isNaN(Number(customerId))) {
    query = query.eq('customer_id', Number(customerId));
  }

  const { data: notifications, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped = (notifications || []).map((n: any) => ({
    id: n.id,
    business_id: n.business_id,
    customer_id: n.customer_id,
    type: n.type,
    channel: n.channel,
    recipient: n.recipient,
    subject: n.subject,
    message: n.message,
    status: n.status,
    scheduled_for: n.scheduled_for ? Math.floor(new Date(n.scheduled_for).getTime() / 1000) : null,
    sent_at: n.sent_at ? Math.floor(new Date(n.sent_at).getTime() / 1000) : null,
    created_at: Math.floor(new Date(n.created_at).getTime() / 1000),
    customer_name: n.customers?.name || null,
  }));

  return NextResponse.json({ notifications: mapped });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId, true);
  if (!business) return NextResponse.json({ error: 'Negocio no disponible.' }, { status: 500 });

  const body = (await request.json()) as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  // CASE 1: Reminders for a Booking
  if (body.bookingId) {
    const bookingId = Number(body.bookingId);
    const target = String(body.target || 'both');
    const channel = String(body.channel || 'both');

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id, starts_at, ends_at, status, payment_status,
        customers(id, name, email, phone),
        professionals(id, name, email, phone),
        services(name, class_type, capacity),
        businesses(name, address, phone)
      `)
      .eq('id', bookingId)
      .eq('business_id', business.id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Reserva no encontrada.' }, { status: 404 });
    }

    const customer = booking.customers as any;
    const professional = booking.professionals as any;
    const service = booking.services as any;
    const biz = booking.businesses as any;

    const classDate = new Date(booking.starts_at);
    const dateStr = classDate.toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = classDate.toLocaleTimeString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
    });

    const bizName = biz?.name || 'Agendando';
    const bizAddr = biz?.address ? ` (${biz.address})` : '';

    const studentWaMsg = `¡Hola ${customer?.name}! 🧘 Te recordamos tu clase de *${service?.name}* con tu instructor/a *${professional?.name}* agendada para el *${dateStr}* a las *${timeStr} hrs* en ${bizName}${bizAddr}. Por favor confírmanos si asistirás. ¡Te esperamos!`;
    const studentMailSubject = `Recordatorio de Clase: ${service?.name} - ${dateStr} ${timeStr} hrs`;
    const studentMailBody = `Estimado/a ${customer?.name},\n\nTe recordamos que tienes una clase agendada:\n\n• Clase: ${service?.name}\n• Instructor/a: ${professional?.name}\n• Fecha y Hora: ${dateStr} a las ${timeStr} hrs\n• Lugar: ${bizName}${bizAddr}\n\nPor favor preséntate 5 a 10 minutos antes.\nSi necesitas reprogramar o tienes alguna consulta, puedes responder a este correo o contactarnos vía WhatsApp.\n\n¡Te esperamos con entusiasmo!\n${bizName}`;

    const studentCleanPhone = cleanPhone(customer?.phone);
    const studentWhatsappUrl = studentCleanPhone
      ? `https://wa.me/${studentCleanPhone}?text=${encodeURIComponent(studentWaMsg)}`
      : null;
    const studentMailtoUrl = customer?.email
      ? `mailto:${customer.email}?subject=${encodeURIComponent(studentMailSubject)}&body=${encodeURIComponent(studentMailBody)}`
      : null;

    const instructorWaMsg = `¡Hola ${professional?.name}! 📋 Recordatorio de clase: Tienes agendada la sesión de *${service?.name}* con el alumno *${customer?.name}* (${customer?.phone || customer?.email || 'Sin contacto'}) para el *${dateStr}* a las *${timeStr} hrs*. ¡Buen entrenamiento!`;
    const instructorMailSubject = `Aviso de Clase Agendada: ${service?.name} con ${customer?.name} - ${dateStr} ${timeStr} hrs`;
    const instructorMailBody = `Estimado/a ${professional?.name},\n\nTe recordamos que tienes una clase programada en el sistema:\n\n• Clase: ${service?.name}\n• Alumno/a: ${customer?.name}\n• Contacto Alumno: ${customer?.phone || 'No registrado'} / ${customer?.email}\n• Fecha y Hora: ${dateStr} a las ${timeStr} hrs\n• Modalidad: ${service?.class_type === 'grupal' ? 'Grupal (Cap. ' + service?.capacity + ')' : 'Individual'}\n\nDetalles disponibles en tu panel de Agendando.\n\nSaludos cordiales,\n${bizName}`;

    const instructorCleanPhone = cleanPhone(professional?.phone);
    const instructorWhatsappUrl = instructorCleanPhone
      ? `https://wa.me/${instructorCleanPhone}?text=${encodeURIComponent(instructorWaMsg)}`
      : null;
    const instructorMailtoUrl = professional?.email
      ? `mailto:${professional.email}?subject=${encodeURIComponent(instructorMailSubject)}&body=${encodeURIComponent(instructorMailBody)}`
      : null;

    if (target === 'student' || target === 'both') {
      const ch = channel === 'email' ? 'email' : 'whatsapp';
      const rec = ch === 'email' ? customer?.email : (customer?.phone || customer?.email);
      await supabase.from('notifications').insert({
        business_id: business.id,
        customer_id: customer?.id,
        type: 'class_reminder',
        channel: ch,
        recipient: rec || '',
        subject: studentMailSubject,
        message: ch === 'email' ? studentMailBody : studentWaMsg,
        status: 'sent',
        sent_at: nowIso,
      });
    }

    if (target === 'instructor' || target === 'both') {
      const ch = channel === 'email' ? 'email' : 'whatsapp';
      const rec = ch === 'email' ? professional?.email : (professional?.phone || professional?.email);
      await supabase.from('notifications').insert({
        business_id: business.id,
        customer_id: null,
        type: 'class_reminder',
        channel: ch,
        recipient: rec || '',
        subject: instructorMailSubject,
        message: ch === 'email' ? instructorMailBody : instructorWaMsg,
        status: 'sent',
        sent_at: nowIso,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Recordatorios generados y registrados exitosamente.',
      booking: {
        id: booking.id,
        service_name: service?.name,
        date_formatted: dateStr,
        time_formatted: timeStr,
      },
      reminders: {
        student: {
          name: customer?.name,
          email: customer?.email,
          phone: customer?.phone,
          whatsappUrl: studentWhatsappUrl,
          mailtoUrl: studentMailtoUrl,
          whatsappMessage: studentWaMsg,
          emailSubject: studentMailSubject,
          emailBody: studentMailBody,
        },
        instructor: {
          name: professional?.name,
          email: professional?.email,
          phone: professional?.phone,
          whatsappUrl: instructorWhatsappUrl,
          mailtoUrl: instructorMailtoUrl,
          whatsappMessage: instructorWaMsg,
          emailSubject: instructorMailSubject,
          emailBody: instructorMailBody,
        },
      },
    }, { status: 201 });
  }

  // CASE 2: Customer reminder by customerId
  const customerId = Number(body.customerId);
  const type = String(body.type || 'payment_due');
  const customMessage = body.message ? String(body.message).trim() : '';

  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ error: 'ID de alumno o ID de reserva requerido.' }, { status: 400 });
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, email, phone, plan_name, monthly_fee, payment_due_day, membership_status, next_payment_due')
    .eq('id', customerId)
    .eq('business_id', business.id)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 });
  }

  let finalMessage = customMessage;
  let subject = 'Notificación';

  if (!finalMessage) {
    if (type === 'payment_due') {
      subject = 'Recordatorio de Mensualidad';
      const dueText = customer.next_payment_due
        ? new Date(customer.next_payment_due).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
        : `el día ${customer.payment_due_day || 5} de este mes`;

      const feeText = customer.monthly_fee ? ` por un valor de $${customer.monthly_fee.toLocaleString('es-CL')}` : '';
      finalMessage = `Hola ${customer.name}! 👋 Te recordamos que tu mensualidad (${customer.plan_name || 'Plan Regular'}${feeText}) vence ${dueText}. Por favor recuerda registrar tu pago para mantener tus cupos asegurados. ¡Gracias!`;
    } else if (type === 'class_reminder') {
      subject = 'Recordatorio de Próxima Clase';
      const { data: nextBooking } = await supabase
        .from('bookings')
        .select(`
          starts_at,
          services(name),
          professionals(name)
        `)
        .eq('customer_id', customerId)
        .eq('business_id', business.id)
        .gte('starts_at', nowIso)
        .eq('status', 'confirmed')
        .order('starts_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextBooking) {
        const classDate = new Date(nextBooking.starts_at);
        const dateStr = classDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
        const timeStr = classDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const sName = (nextBooking.services as any)?.name || 'Clase';
        const pName = (nextBooking.professionals as any)?.name || 'Instructor';
        finalMessage = `Hola ${customer.name}! 🧘 Te recordamos que tienes clase de ${sName} con ${pName} el día ${dateStr} a las ${timeStr}. ¡Te esperamos!`;
      } else {
        finalMessage = `Hola ${customer.name}! Te recordamos revisar el calendario de tus próximas clases con tu instructor. ¡Que tengas una excelente jornada!`;
      }
    }
  }

  const channel = customer.phone ? 'whatsapp' : 'email';
  const recipient = customer.phone || customer.email;

  const { data: inserted, error: notifErr } = await supabase
    .from('notifications')
    .insert({
      business_id: business.id,
      customer_id: customerId,
      type,
      channel,
      recipient,
      subject,
      message: finalMessage,
      status: 'sent',
      sent_at: nowIso,
    })
    .select('id')
    .single();

  if (notifErr || !inserted) {
    return NextResponse.json({ error: notifErr?.message || 'Error al guardar notificación.' }, { status: 500 });
  }

  let whatsappUrl = null;
  if (customer.phone) {
    const cleanP = cleanPhone(customer.phone);
    whatsappUrl = `https://wa.me/${cleanP}?text=${encodeURIComponent(finalMessage)}`;
  }

  const mailtoUrl = customer.email
    ? `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalMessage)}`
    : null;

  return NextResponse.json({
    id: inserted.id,
    message: 'Notificación registrada y enviada.',
    notification: {
      type,
      channel,
      recipient,
      subject,
      content: finalMessage,
      whatsappUrl,
      mailtoUrl,
    },
  }, { status: 201 });
}

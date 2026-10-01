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

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId);
  if (!business) return NextResponse.json({ payments: [] });

  const url = new URL(request.url);
  const customerId = url.searchParams.get('customerId');

  let query = supabase
    .from('payments')
    .select(`
      id, business_id, customer_id, amount, payment_date, period, payment_method, status, notes, created_at,
      customers(name, email, phone)
    `)
    .eq('business_id', business.id)
    .order('payment_date', { ascending: false })
    .limit(100);

  if (customerId && !isNaN(Number(customerId))) {
    query = query.eq('customer_id', Number(customerId));
  }

  const { data: payments, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped = (payments || []).map((p: any) => ({
    id: p.id,
    business_id: p.business_id,
    customer_id: p.customer_id,
    amount: p.amount,
    payment_date: Math.floor(new Date(p.payment_date).getTime() / 1000),
    period: p.period,
    payment_method: p.payment_method,
    status: p.status,
    notes: p.notes,
    created_at: Math.floor(new Date(p.created_at).getTime() / 1000),
    customer_name: p.customers?.name || 'Alumno',
    customer_email: p.customers?.email || '',
    customer_phone: p.customers?.phone || '',
  }));

  return NextResponse.json({ payments: mapped });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const business = await getBusiness(supabase, user.userId, true);
  if (!business) return NextResponse.json({ error: 'Negocio no disponible.' }, { status: 500 });

  const body = (await request.json()) as Record<string, unknown>;
  const customerId = Number(body.customerId);
  const amount = Number(body.amount);
  const paymentMethod = String(body.paymentMethod || 'transfer');
  const period = String(body.period || new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date())).trim();
  const notes = String(body.notes || '').trim();
  const rawDate = body.paymentDate ? new Date(String(body.paymentDate)) : new Date();
  const paymentDateIso = rawDate.toISOString();

  if (!Number.isInteger(customerId) || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Alumno y monto válido son requeridos.' }, { status: 400 });
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, email, payment_due_day, notes')
    .eq('id', customerId)
    .eq('business_id', business.id)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 });
  }

  const isAbono = Boolean(body.isAbono);
  const remainingBalance = body.remainingBalance !== undefined ? Math.max(0, Number(body.remainingBalance)) : null;

  if (isAbono && remainingBalance !== null && remainingBalance > 0) {
    const abonoNote = notes
      ? `${notes} (Abono parcial, saldo: $${remainingBalance.toLocaleString('es-CL')})`
      : `Abono parcial de $${amount.toLocaleString('es-CL')} (Saldo: $${remainingBalance.toLocaleString('es-CL')})`;

    const { data: inserted, error: payErr } = await supabase
      .from('payments')
      .insert({
        business_id: business.id,
        customer_id: customerId,
        amount,
        payment_date: paymentDateIso,
        period,
        payment_method: paymentMethod,
        status: 'completed',
        notes: abonoNote,
      })
      .select('id')
      .single();

    if (payErr || !inserted) return NextResponse.json({ error: payErr?.message || 'Error al guardar abono.' }, { status: 500 });

    const newDueIso = body.newDueDate ? new Date(Number(body.newDueDate) * 1000).toISOString() : null;
    const noteEntry = `Abonó $${amount.toLocaleString('es-CL')} el ${rawDate.toLocaleDateString('es-CL')}. Saldo restante: $${remainingBalance.toLocaleString('es-CL')}`;
    const updatedNotes = customer.notes ? `${customer.notes} | ${noteEntry}` : noteEntry;

    const custPayload: Record<string, unknown> = {
      monthly_fee: remainingBalance,
      membership_status: 'pending',
      last_payment_date: paymentDateIso,
      notes: updatedNotes,
    };
    if (newDueIso) custPayload.next_payment_due = newDueIso;

    await supabase.from('customers').update(custPayload).eq('id', customerId);

    const receiptMessage = `Hola ${customer.name}! Registramos tu abono de $${amount.toLocaleString('es-CL')} para ${period}. Te queda un saldo pendiente de $${remainingBalance.toLocaleString('es-CL')}. Muchas gracias!`;
    const recipient = customer.phone || customer.email;

    await supabase.from('notifications').insert({
      business_id: business.id,
      customer_id: customerId,
      type: 'payment_received',
      channel: customer.phone ? 'whatsapp' : 'email',
      recipient,
      subject: 'Comprobante de abono',
      message: receiptMessage,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      id: inserted.id,
      message: `Abono de $${amount.toLocaleString('es-CL')} registrado con éxito. Saldo pendiente restante: $${remainingBalance.toLocaleString('es-CL')}.`,
      isAbono: true,
      remainingBalance,
      receiptMessage,
    }, { status: 201 });
  }

  // Full Payment
  const { data: inserted, error: payErr } = await supabase
    .from('payments')
    .insert({
      business_id: business.id,
      customer_id: customerId,
      amount,
      payment_date: paymentDateIso,
      period,
      payment_method: paymentMethod,
      status: 'completed',
      notes: notes || null,
    })
    .select('id')
    .single();

  if (payErr || !inserted) return NextResponse.json({ error: payErr?.message || 'Error al guardar pago.' }, { status: 500 });

  const nextMonth = new Date(rawDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const dueDay = Math.min(customer.payment_due_day || 5, 28);
  nextMonth.setDate(dueDay);
  nextMonth.setHours(23, 59, 59, 0);

  await supabase
    .from('customers')
    .update({
      membership_status: 'active',
      last_payment_date: paymentDateIso,
      next_payment_due: nextMonth.toISOString(),
    })
    .eq('id', customerId);

  const receiptMessage = `Hola ${customer.name}! Registramos tu pago de $${amount.toLocaleString('es-CL')} para el período ${period}. Tu membresía está al día hasta el ${nextMonth.toLocaleDateString('es-CL')}. Muchas gracias!`;
  const recipient = customer.phone || customer.email;

  await supabase.from('notifications').insert({
    business_id: business.id,
    customer_id: customerId,
    type: 'payment_received',
    channel: customer.phone ? 'whatsapp' : 'email',
    recipient,
    subject: 'Comprobante de pago',
    message: receiptMessage,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({
    id: inserted.id,
    message: `Pago de $${amount.toLocaleString('es-CL')} registrado con éxito.`,
    nextPaymentDue: Math.floor(nextMonth.getTime() / 1000),
    receiptMessage,
  }, { status: 201 });
}

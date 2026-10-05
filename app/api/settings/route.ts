import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';
import { getBusinessForUser } from '../../lib/tenant';

async function business(supabase: any, user: any, request?: Request, create = false) {
  const bId = request?.headers?.get('x-business-id');
  return getBusinessForUser(supabase, user, create, bId ? Number(bId) : null);
}

export async function GET(request: Request) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const settings = await business(supabase, u, request, true);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await business(supabase, u, request, true);
  if (!b) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const x = (await request.json()) as Record<string, unknown>;
  const name = String(x.name ?? '').trim();
  const email = String(x.email ?? '').trim();
  const phone = String(x.phone ?? '').trim();
  const address = String(x.address ?? '').trim();
  const description = String(x.description ?? '').trim();
  const timezone = String(x.timezone ?? '');
  const currency = String(x.currency ?? 'CLP');
  const cancellation = Number(x.cancellationHours);
  const window = Number(x.bookingWindowDays);

  if (
    !name ||
    (email && !/^\S+@\S+\.\S+$/.test(email)) ||
    !['America/Santiago', 'America/Bogota', 'America/Mexico_City', 'Europe/Madrid'].includes(timezone) ||
    !['CLP', 'USD', 'EUR'].includes(currency) ||
    !Number.isInteger(cancellation) ||
    cancellation < 0 ||
    !Number.isInteger(window) ||
    window < 1 ||
    window > 365
  ) {
    return NextResponse.json({ error: 'Revisa la información y las reglas de reserva.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('businesses')
    .update({
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      description: description || null,
      timezone,
      currency,
      cancellation_hours: cancellation,
      booking_window_days: window,
    })
    .eq('id', b.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: 'Configuración guardada correctamente.' });
}

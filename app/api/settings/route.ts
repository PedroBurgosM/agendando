import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';

async function business(supabase: any, owner: string, create = false) {
  let { data: b } = await supabase
    .from('businesses')
    .select('*')
    .or(`owner_id.eq.${owner},owner_id.eq.1,owner_id.eq.usr_local_instructor`)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!b && create) {
    const { data: created } = await supabase
      .from('businesses')
      .insert({
        owner_id: owner,
        name: 'Espacio Bienestar',
        slug: `espacio-${owner}-${Date.now()}`,
        timezone: 'America/Santiago',
        currency: 'CLP',
        cancellation_hours: 24,
        booking_window_days: 60,
      })
      .select()
      .single();
    b = created;
  }
  return b;
}

export async function GET() {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const settings = await business(supabase, u.userId, true);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await business(supabase, u.userId, true);
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

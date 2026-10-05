import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatGPTUser } from '../chatgpt-auth';

export interface TenantBusiness {
  id: number;
  owner_id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  description?: string | null;
  timezone: string;
  currency: string;
  cancellation_hours: number;
  booking_window_days: number;
  created_at?: string;
}

export function isSuperAdmin(user: { email?: string; role?: string; userId?: string | number } | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  const role = (user.role || '').toLowerCase().trim();
  const id = String(user.userId || '');
  return email === 'admin@agendando.cl' || role === 'superadmin' || id === '1';
}

export async function getBusinessForUser(
  supabase: SupabaseClient,
  user: ChatGPTUser,
  create = false,
  requestedBusinessId?: number | null
): Promise<TenantBusiness | null> {
  const ownerId = String(user.userId);
  const superAdmin = isSuperAdmin(user);

  // 1. If Super Admin requested a specific business to view/manage
  if (superAdmin && requestedBusinessId && requestedBusinessId > 0) {
    const { data: b } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', requestedBusinessId)
      .maybeSingle();
    if (b) return b as TenantBusiness;
  }

  // 2. Look for business owned by this user
  const { data: userBusiness } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', ownerId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (userBusiness) {
    return userBusiness as TenantBusiness;
  }

  // 3. Fallback for Super Admin (defaults to main business id 1 or usr_local_instructor)
  if (superAdmin) {
    const { data: fallback } = await supabase
      .from('businesses')
      .select('*')
      .or('owner_id.eq.1,owner_id.eq.usr_local_instructor,id.eq.1')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fallback) return fallback as TenantBusiness;
  }

  // 4. If create is enabled, auto-create business for new tenant
  if (create) {
    const { data: maxB } = await supabase.from('businesses').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
    const nextBId = (maxB?.id ? Number(maxB.id) : 0) + 1;
    const cleanName = user.displayName ? `Espacio de ${user.displayName}` : 'Espacio de Clases';
    const cleanSlug = `espacio-${ownerId}-${Date.now().toString().slice(-4)}`;

    const { data: created, error } = await supabase
      .from('businesses')
      .insert({
        id: nextBId,
        owner_id: ownerId,
        name: cleanName,
        slug: cleanSlug,
        email: user.email || null,
        timezone: 'America/Santiago',
        currency: 'CLP',
        cancellation_hours: 24,
        booking_window_days: 60,
      })
      .select()
      .single();

    if (!error && created) {
      return created as TenantBusiness;
    }
  }

  return null;
}

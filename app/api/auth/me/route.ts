import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { getSupabase } from '../../../lib/supabase';
import { getBusinessForUser, isSuperAdmin } from '../../../lib/tenant';

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const supabase = getSupabase();
    let business = null;
    if (supabase) {
      business = await getBusinessForUser(supabase, user, false);
    }

    const superAdmin = isSuperAdmin(user);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.userId,
        name: user.displayName || user.fullName,
        email: user.email,
        role: superAdmin ? 'superadmin' : (user.role || 'admin'),
        isSuperAdmin: superAdmin,
        business: business ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          phone: business.phone,
        } : null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error al verificar sesión.' },
      { status: 500 }
    );
  }
}

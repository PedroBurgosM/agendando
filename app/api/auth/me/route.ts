import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.userId,
        name: user.displayName || user.fullName,
        email: user.email,
        role: user.role || 'admin',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error al verificar sesión.' },
      { status: 500 }
    );
  }
}

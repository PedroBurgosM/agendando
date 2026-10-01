'use client';

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';

const chileDateParts = (value: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const bookingDateKey = (seconds: number) => { const p = chileDateParts(new Date(seconds * 1000)); return `${p.year}-${p.month}-${p.day}`; };
const startOfWeek = (date: Date) => { const result = new Date(date); result.setHours(12, 0, 0, 0); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); return result; };
const addDays = (date: Date, days: number) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };

function SummaryDashboard({ setActive, demo }: { setActive: (view: string) => void; demo: (msg: string) => void }) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date()), []);

  async function loadData(showNotice = false) {
    try {
      if (showNotice) setRefreshing(true);
      const [bookRes, custRes, payRes, servRes, teamRes] = await Promise.all([
        fetch('/api/bookings?includeCancelled=1', { cache: 'no-store' }),
        fetch('/api/customers', { cache: 'no-store' }),
        fetch('/api/payments', { cache: 'no-store' }),
        fetch('/api/services', { cache: 'no-store' }),
        fetch('/api/team', { cache: 'no-store' }),
      ]);

      if (bookRes.ok) {
        const d = (await bookRes.json()) as { bookings: BookingRow[] };
        setBookings(d.bookings || []);
      }
      if (custRes.ok) {
        const d = (await custRes.json()) as { customers: Customer[] };
        setCustomers(d.customers || []);
      }
      if (payRes.ok) {
        const d = (await payRes.json()) as { payments: StudentPayment[] };
        setPayments(d.payments || []);
      }
      if (servRes.ok) {
        const d = (await servRes.json()) as { services: Service[] };
        setServices(d.services || []);
      }
      if (teamRes.ok) {
        const d = (await teamRes.json()) as { team: TeamMember[] };
        setTeam(d.team || []);
      }
      if (showNotice) demo('Datos sincronizados correctamente.');
    } catch {
      demo('Error al sincronizar datos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const now = new Date();
  const todayKey = bookingDateKey(Math.floor(Date.now() / 1000));
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // 1. Reservas
  const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
  const thisMonthBookings = activeBookings.filter((b) => {
    const d = new Date(b.starts_at * 1000);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const todayBookings = activeBookings.filter((b) => bookingDateKey(b.starts_at) === todayKey);

  // 2. Ingresos recaudados / confirmados
  const totalPaidPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaidBookings = activeBookings
    .filter((b) => b.payment_status === 'paid')
    .reduce((sum, b) => sum + (b.amount_clp || 0), 0);
  const projectedRevenue = customers.reduce((sum, c) => sum + (c.monthly_fee || 0), 0);
  const displayRevenue = totalPaidPayments > 0 ? totalPaidPayments : (totalPaidBookings > 0 ? totalPaidBookings : projectedRevenue);

  // 3. Alumnos
  const activeCustomers = customers.filter((c) => c.membership_status === 'active');
  const pendingCustomers = customers.filter((c) => c.membership_status === 'pending' || c.membership_status === 'overdue');
  const activePercent = customers.length > 0 ? Math.round((activeCustomers.length / customers.length) * 100) : 0;

  // 4. Asistencia
  const attendedCount = bookings.filter((b) => b.status === 'completed' || b.status === 'attended').length;
  const noShowCount = bookings.filter((b) => b.status === 'no_show').length;
  const evaluatedAttendance = attendedCount + noShowCount;
  const attendanceRate = evaluatedAttendance > 0 ? Math.round((attendedCount / evaluatedAttendance) * 100) : 100;

  // Próximas reservas (ordenadas por fecha y hora ascendente, excluir canceladas)
  const upcomingList = activeBookings
    .slice()
    .sort((a, b) => a.starts_at - b.starts_at)
    .filter((b) => {
      return b.ends_at * 1000 >= Date.now() - 3600000 || bookingDateKey(b.starts_at) === todayKey;
    });

  const displayList = upcomingList.length > 0 ? upcomingList.slice(0, 6) : activeBookings.slice(0, 6);

  function formatBookingTime(seconds: number) {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(seconds * 1000));
  }

  function formatBookingDateBadge(seconds: number) {
    const isToday = bookingDateKey(seconds) === todayKey;
    if (isToday) return 'Hoy';
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: 'numeric',
      month: 'short'
    }).format(new Date(seconds * 1000));
  }

  return (
    <div className="content">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>Buenos días, Pedro</h1>
          <p>Control de alumnos, clases y mensualidades al día.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
            }}
          >
            <span style={{ display: 'inline-block', transform: refreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s' }}>↻</span>
            {refreshing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
          <button className="primary" onClick={() => setActive('Reservas')}>
            <span>＋</span> Ver reservas
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <div>
            <span className="stat-icon purple">▣</span>
            <span className="trend up">{todayBookings.length} hoy</span>
          </div>
          <p>Reservas este mes</p>
          <strong>{thisMonthBookings.length}</strong>
          <small>{todayBookings.length === 1 ? '1 reserva para hoy' : `${todayBookings.length} reservas para hoy`}</small>
        </article>

        <article className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActive('Pagos')} title="Ver panel de Pagos y Cobranzas">
          <div>
            <span className="stat-icon coral">$</span>
            <span className="trend up">💳 Ir a Pagos →</span>
          </div>
          <p>Ingresos confirmados</p>
          <strong>${displayRevenue.toLocaleString('es-CL')}</strong>
          <small>CLP · {payments.length > 0 ? `${payments.length} pago(s) registrado(s)` : 'Recaudación activa'}</small>
        </article>

        <article className="stat-card">
          <div>
            <span className="stat-icon mint">♙</span>
            <span className="trend up">{activePercent}% activos</span>
          </div>
          <p>Alumnos activos</p>
          <strong>{activeCustomers.length}</strong>
          <small>
            {customers.length} total ·{' '}
            <span
              style={{ color: pendingCustomers.length > 0 ? '#b91c1c' : '#71717a', fontWeight: pendingCustomers.length > 0 ? 700 : 500, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setActive('Pagos')}
              title="Ver alumnos con cuotas pendientes"
            >
              {pendingCustomers.length} cuotas pendientes →
            </span>
          </small>
        </article>

        <article className="stat-card">
          <div>
            <span className="stat-icon gold">◎</span>
            <span className={attendanceRate >= 90 ? 'trend up' : 'trend neutral'}>{attendanceRate}%</span>
          </div>
          <p>Tasa de asistencia</p>
          <strong>{attendanceRate}%</strong>
          <small>{attendedCount} asistieron · {noShowCount} ausencias</small>
        </article>
      </div>

      <div className="main-grid">
        <article className="panel schedule-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">AGENDA EN VIVO</p>
              <h2>Próximas reservas</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setActive('Reservas')}>Ir a Reservas →</button>
              <span style={{ color: '#475569' }}>·</span>
              <button onClick={() => setActive('Agenda')}>Ver calendario →</button>
            </div>
          </div>

          <div className="appointments">
            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                Cargando reservas sincronizadas…
              </div>
            ) : displayList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📅</span>
                <p style={{ fontSize: '15px', color: '#0f172a', fontWeight: 600, margin: '0 0 6px' }}>
                  No hay reservas programadas
                </p>
                <p style={{ fontSize: '13px', margin: '0 0 16px' }}>
                  Inscribe a un alumno a una clase para comenzar a ver tu agenda aquí.
                </p>
                <button className="primary" style={{ display: 'inline-flex' }} onClick={() => setActive('Reservas')}>
                  <span>＋</span> Inscribir alumno ahora
                </button>
              </div>
            ) : (
              displayList.map((b) => {
                const initials = b.customer_name
                  .split(' ')
                  .filter(Boolean)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                const isToday = bookingDateKey(b.starts_at) === todayKey;

                return (
                  <button
                    className="appointment"
                    key={b.id}
                    onClick={() => setActive('Reservas')}
                    title={`Ver detalle de reserva de ${b.customer_name}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <time style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                        {formatBookingTime(b.starts_at)}
                      </span>
                      <span style={{ fontSize: '10px', color: isToday ? '#059669' : '#64748b', fontWeight: 600 }}>
                        {formatBookingDateBadge(b.starts_at)}
                      </span>
                    </time>
                    <i style={{ background: b.professional_color || '#7559f2' }} />
                    <span
                      className="avatar"
                      style={{
                        background: `${b.professional_color || '#7559f2'}22`,
                        color: b.professional_color || '#52525b',
                        fontWeight: 700
                      }}
                    >
                      {initials || 'A'}
                    </span>
                    <span className="appointment-info">
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {b.customer_name}
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '6px',
                            background:
                              b.status === 'completed' || b.status === 'attended'
                                ? '#064e3b'
                                : b.status === 'no_show'
                                ? '#4c1d1b'
                                : '#1e1b4b',
                            color:
                              b.status === 'completed' || b.status === 'attended'
                                ? '#6ee7b7'
                                : b.status === 'no_show'
                                ? '#fda4af'
                                : '#d4d4d8',
                            fontWeight: 600
                          }}
                        >
                          {b.status === 'completed' || b.status === 'attended'
                            ? '✓ Asistió'
                            : b.status === 'no_show'
                            ? '✗ Ausente'
                            : '● Confirmada'}
                        </span>
                      </strong>
                      <small style={{ color: '#475569' }}>
                        {b.service_name}{' '}
                        <span style={{ color: '#64748b' }}>
                          {b.class_type === 'grupal'
                            ? `· 👥 ${b.enrolled_count}/${b.capacity} cupos`
                            : '· 👤 1 a 1'}
                        </span>
                      </small>
                    </span>
                    <span className="pro" style={{ textAlign: 'right' }}>
                      con {b.professional_name.split(' ')[0]}
                      <small
                        style={{
                          display: 'block',
                          color: b.payment_status === 'paid' ? '#059669' : '#d97706',
                          fontWeight: 600
                        }}
                      >
                        {b.payment_status === 'paid' ? '✓ Al día' : '⏳ Pendiente'}
                      </small>
                    </span>
                    <b>›</b>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <aside className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACCESOS DIRECTOS</p>
              <h2>Acciones rápidas</h2>
            </div>
          </div>
          <div className="quick-grid">
            <button onClick={() => setActive('Alumnos')}>
              <span className="purple">＋</span>
              <strong>Agregar alumno</strong>
              <small>Ficha y mensualidad</small>
            </button>
            <button onClick={() => setActive('Reservas')}>
              <span className="mint">◷</span>
              <strong>Inscribir clase</strong>
              <small>Nueva reserva</small>
            </button>
            <button onClick={() => setActive('Servicios')}>
              <span className="coral">◇</span>
              <strong>Clases y Cupos</strong>
              <small>Configurar precios</small>
            </button>
            <button onClick={() => setActive('Agenda')}>
              <span className="gold">▦</span>
              <strong>Ver calendario</strong>
              <small>Agenda semanal</small>
            </button>
          </div>

          <div className="setup-card" style={{ marginTop: '16px' }}>
            <div
              className="setup-ring"
              style={{
                background: `conic-gradient(#10b981 0% ${activePercent}%, #e2e8f0 ${activePercent}% 100%)`
              }}
            >
              <strong>{activePercent}%</strong>
            </div>
            <div>
              <strong>Estado del Espacio</strong>
              <small>
                {services.filter((s) => s.active !== 0).length} clases activas ·{' '}
                {team.filter((t) => t.active !== 0).length} instructores ·{' '}
                {activeCustomers.length}/{customers.length} alumnos al día.
              </small>
              <button onClick={() => setActive('Configuración')}>
                Configurar negocio y horarios →
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface SessionUser {
  id: string | number;
  name: string;
  email: string;
  role: string;
}

function LoginView({ onLoginSuccess, demo }: { onLoginSuccess: (user: SessionUser) => void; demo: (msg: string) => void }) {
  const [email, setEmail] = useState('admin@agendando.cl');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as { ok?: boolean; user?: SessionUser; error?: string };
      if (!res.ok || !data.ok || !data.user) {
        throw new Error(data.error || 'Credenciales inválidas.');
      }

      demo(`¡Bienvenido, ${data.user.name}!`);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      padding: '20px',
      fontFamily: 'inherit'
    }}>
      <div style={{
        maxWidth: '430px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          background: '#0f172a',
          padding: '32px 28px 24px',
          textAlign: 'center',
          color: '#ffffff',
          position: 'relative'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            marginBottom: '16px',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <img src="/logo-icon.png" alt="Agendando" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          </div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
            Agendando
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Acceso seguro a la administración
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '28px' }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Correo electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@agendando.cl"
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                color: '#0f172a',
                background: '#f8fafc',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                style={{
                  width: '100%',
                  padding: '11px 42px 11px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  color: '#0f172a',
                  background: '#f8fafc',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '15px',
                  padding: '4px'
                }}
                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Quick preset credentials helper */}
          <div style={{
            background: '#f1f5f9',
            border: '1px dashed #cbd5e1',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div>
              <span style={{ fontWeight: 600, color: '#1e293b', display: 'block' }}>⚡ Acceso rápido Woodland / Demo:</span>
              <span style={{ color: '#64748b' }}>admin@agendando.cl / admin123</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail('admin@agendando.cl');
                setPassword('admin123');
              }}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#2563eb',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Usar datos
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: '#0f172a',
              color: '#ffffff',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'background 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading ? 'Iniciando sesión…' : 'Iniciar Sesión'}
          </button>

          <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <a
              href="/reservar"
              target="_blank"
              style={{
                fontSize: '13px',
                color: '#475569',
                textDecoration: 'none',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>↗</span>
              <span>Ir a la página pública de reservas de alumnos</span>
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

const nav = ['Resumen', 'Agenda', 'Reservas', 'Alumnos', 'Pagos', 'Servicios', 'Equipo'];

export default function Home() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [active, setActive] = useState('Resumen');
  const [notice, setNotice] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const today = useMemo(() => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), []);

  function demo(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { authenticated: boolean; user: SessionUser };
        if (data.authenticated && data.user) {
          setSessionUser(data.user);
        } else {
          setSessionUser(null);
        }
      } else {
        setSessionUser(null);
      }
    } catch {
      setSessionUser(null);
    } finally {
      setAuthChecking(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSessionUser(null);
      demo('Sesión cerrada correctamente.');
    } catch {
      setSessionUser(null);
    }
  }

  useEffect(() => {
    void checkSession();
  }, []);

  if (authChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'inherit'
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16
        }}>
          <img src="/logo-icon.png" alt="Agendando" style={{ width: 34, height: 34 }} />
        </div>
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>Verificando sesión…</div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <>
        {notice && <div className="toast" role="status">{notice}</div>}
        <LoginView onLoginSuccess={(u) => setSessionUser(u)} demo={demo} />
      </>
    );
  }

  return (
    <main className="app-shell">
      {notice && <div className="toast" role="status">{notice}</div>}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <a
            className="brand"
            href="#top"
            aria-label="Agendando, inicio"
            onClick={() => setMobileMenuOpen(false)}
          >
            <img src="/logo-icon.png" alt="Logo Agendando" className="brand-logo-img" />
            <div className="brand-text">
              <span className="brand-title">Agendando</span>
              <span className="brand-subtitle">Agenda · Organiza</span>
            </div>
          </a>
          <button
            type="button"
            className="sidebar-close-btn"
            aria-label="Cerrar menú"
            onClick={() => setMobileMenuOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav aria-label="Navegación principal">
          {nav.map((item, index) => (
            <button
              key={item}
              className={active === item ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setActive(item);
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-icon" aria-hidden="true">{['⌂','▦','◫','♙','💳','◇','♚'][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={active==='Configuración'?'nav-item active':'nav-item'}
            onClick={() => {
              setActive('Configuración');
              setMobileMenuOpen(false);
            }}
          >
            ⚙ Configuración
          </button>
          <div className="profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                {sessionUser?.name ? sessionUser.name.charAt(0).toUpperCase() : 'A'}
              </span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                  {sessionUser?.name || 'Administrador'}
                </strong>
                <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '11px' }}>
                  {sessionUser?.email || 'admin@agendando.cl'}
                </small>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}
            >
              Salir
            </button>
          </div>
        </div>
      </aside>

      <section className="workspace" id="top">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Abrir menú"
            onClick={() => setMobileMenuOpen(true)}
          >
            ☰
          </button>
          <div className="mobile-brand">
            <img src="/logo-icon.png" alt="Logo Agendando" className="mobile-brand-logo" />
            <span>Agendando</span>
          </div>
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Buscar"
              placeholder="Buscar alumnos, clases o reservas..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setActive('Reservas');
                }
              }}
            />
            <kbd>↵ Enter</kbd>
          </div>
          <div className="top-actions">
            <button
              className="public-link"
              onClick={() => window.location.assign('/reservar')}
              title="Ver mi página pública de reservas"
            >
              <span>↗</span>
              <span className="public-link-text-full">Ver mi página</span>
              <span className="public-link-text-short">Mi página</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                cursor: 'pointer',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🚪</span>
              <span className="public-link-text-full">Salir</span>
            </button>
          </div>
        </header>

        {active === 'Agenda' ? (
          <AgendaModule demo={demo} />
        ) : active === 'Reservas' ? (
          <BookingsModule demo={demo} />
        ) : (active === 'Alumnos' || active === 'Clientes') ? (
          <ClientsModule demo={demo} />
        ) : (active === 'Pagos' || active === 'Cobranzas') ? (
          <PaymentsModule demo={demo} />
        ) : active === 'Servicios' ? (
          <ServicesModule demo={demo} />
        ) : active === 'Equipo' ? (
          <TeamModule demo={demo} />
        ) : active === 'Configuración' ? (
          <SettingsModule demo={demo} />
        ) : (
          <SummaryDashboard setActive={setActive} demo={demo} />
        )}
      </section>

      {/* Barra de navegación inferior fija para móviles */}
      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        <button
          type="button"
          className={active === 'Resumen' ? 'active' : ''}
          onClick={() => setActive('Resumen')}
        >
          <span className="nav-icon">⌂</span>
          <small>Resumen</small>
        </button>
        <button
          type="button"
          className={active === 'Agenda' ? 'active' : ''}
          onClick={() => setActive('Agenda')}
        >
          <span className="nav-icon">▦</span>
          <small>Agenda</small>
        </button>
        <button
          type="button"
          className={active === 'Reservas' ? 'active' : ''}
          onClick={() => setActive('Reservas')}
        >
          <span className="nav-icon">◫</span>
          <small>Reservas</small>
        </button>
        <button
          type="button"
          className={(active === 'Alumnos' || active === 'Clientes') ? 'active' : ''}
          onClick={() => setActive('Alumnos')}
        >
          <span className="nav-icon">♙</span>
          <small>Alumnos</small>
        </button>
        <button
          type="button"
          className={(active === 'Pagos' || active === 'Cobranzas') ? 'active' : ''}
          onClick={() => setActive('Pagos')}
        >
          <span className="nav-icon">💳</span>
          <small>Pagos</small>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="nav-icon">☰</span>
          <small>Menú</small>
        </button>
      </nav>

      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}

type AgendaBooking = {
  id: number;
  service_id: number;
  professional_id: number;
  customer_id: number;
  starts_at: number;
  ends_at: number;
  status: string;
  payment_status: string;
  amount_clp: number;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  plan_name?: string;
  membership_status?: string;
  service_name: string;
  class_type?: string;
  capacity?: number;
  professional_name: string;
  professional_email?: string;
  professional_phone?: string | null;
};
type EnrolledStudent = {
  booking_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  plan_name?: string;
  membership_status?: string;
  payment_status: string;
  status: string;
  amount_clp: number;
};

type CalendarSession = {
  sessionKey: string;
  service_id: number;
  service_name: string;
  class_type: string;
  capacity: number;
  professional_id: number;
  professional_name: string;
  professional_email?: string;
  professional_phone?: string | null;
  starts_at: number;
  ends_at: number;
  day: number;
  start: number;
  span: number;
  color: string;
  dateKey: string;
  students: EnrolledStudent[];
};

function AgendaModule({ demo }: { demo: (message: string) => void }) {
  const [view, setView] = useState<'Semana' | 'Día'>('Semana');
  const [professional, setProfessional] = useState('Todos');
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [prefillSession, setPrefillSession] = useState<{ serviceId?: string; professionalId?: string; date?: string; time?: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [savedBookings, setSavedBookings] = useState<AgendaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [agendaServices, setAgendaServices] = useState<Service[]>([]);
  const [agendaTeam, setAgendaTeam] = useState<TeamMember[]>([]);
  const [agendaStudents, setAgendaStudents] = useState<Customer[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const weekStart = startOfWeek(focusDate);
  const days = view === 'Semana' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [focusDate];
  const todayKey = localDateKey(new Date());
  const label = view === 'Día' ? new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(focusDate) : `${new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(days[0])} – ${new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(days[6])}`;
  const colorClasses = ['purple-event', 'mint-event', 'coral-event'];

  function initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  const visibleSessions: CalendarSession[] = useMemo(() => {
    const sessionMap = new Map<string, CalendarSession>();

    for (const b of savedBookings) {
      if (b.status === 'cancelled') continue;
      const dateKey = bookingDateKey(b.starts_at);
      const day = days.findIndex(d => localDateKey(d) === dateKey);
      if (day < 0) continue;
      if (professional !== 'Todos' && String(b.professional_id) !== professional) continue;

      const p = chileDateParts(new Date(b.starts_at * 1000));
      const sessionKey = `${b.service_id}_${b.professional_id}_${b.starts_at}`;

      let session = sessionMap.get(sessionKey);
      if (!session) {
        session = {
          sessionKey,
          service_id: b.service_id,
          service_name: b.service_name,
          class_type: b.class_type || 'individual',
          capacity: b.capacity || (b.class_type === 'grupal' ? 10 : 1),
          professional_id: b.professional_id,
          professional_name: b.professional_name,
          professional_email: b.professional_email,
          professional_phone: b.professional_phone,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          day,
          start: Number(p.hour) + Number(p.minute) / 60,
          span: (b.ends_at - b.starts_at) / 3600,
          color: colorClasses[Math.abs(Number(b.professional_id)) % colorClasses.length],
          dateKey,
          students: []
        };
        sessionMap.set(sessionKey, session);
      }

      session.students.push({
        booking_id: b.id,
        customer_id: b.customer_id,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        plan_name: b.plan_name,
        membership_status: b.membership_status,
        payment_status: b.payment_status,
        status: b.status,
        amount_clp: b.amount_clp
      });
    }

    return Array.from(sessionMap.values());
  }, [savedBookings, days, professional]);

  const activeSession = selectedSessionKey
    ? visibleSessions.find(s => s.sessionKey === selectedSessionKey) ?? null
    : null;

  const HOUR_HEIGHT = 72;
  const minBookingHour = visibleSessions.reduce((min, s) => Math.min(min, Math.floor(s.start)), 7);
  const START_HOUR = Math.min(7, minBookingHour);
  const maxBookingHour = visibleSessions.reduce((max, s) => Math.max(max, Math.ceil(s.start + s.span)), 21);
  const END_HOUR = Math.max(22, maxBookingHour);
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);
  const totalGridHeight = hours.length * HOUR_HEIGHT;

  const summaryDate = view === 'Día' ? focusDate : (days.find(d => localDateKey(d) === todayKey) ?? days[0]);
  const summaryKey = localDateKey(summaryDate);
  const summaryBookings = savedBookings.filter(b => bookingDateKey(b.starts_at) === summaryKey && (professional === 'Todos' || String(b.professional_id) === professional));
  const occupiedMinutes = summaryBookings.reduce((total, b) => total + Math.round((b.ends_at - b.starts_at) / 60), 0);
  const summaryIncome = summaryBookings.filter(b => b.payment_status === 'paid').reduce((total, b) => total + Number(b.amount_clp), 0);

  async function loadBookings() {
    try {
      const response = await fetch('/api/bookings', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar las clases agendadas.');
      const data = await response.json() as { bookings: AgendaBooking[] };
      setSavedBookings(data.bookings);
    } catch (error) {
      demo(error instanceof Error ? error.message : 'No fue posible cargar las clases.');
    } finally {
      setLoading(false);
    }
  }

  async function loadServices() {
    try {
      const response = await fetch('/api/services', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json() as { services: Service[] };
      setAgendaServices(data.services.filter(s => Boolean(s.active)));
    } catch {
      demo('No fue posible cargar las clases.');
    }
  }

  async function loadTeam() {
    try {
      const response = await fetch('/api/team', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json() as { team: TeamMember[] };
      setAgendaTeam(data.team.filter(m => Boolean(m.active)));
    } catch {
      demo('No fue posible cargar el equipo.');
    }
  }

  async function loadStudents() {
    try {
      const response = await fetch('/api/customers', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json() as { customers: Customer[] };
        setAgendaStudents(data.customers || []);
      }
    } catch {
      // Ignore background error
    }
  }

  useEffect(() => {
    void loadBookings();
    void loadServices();
    void loadTeam();
    void loadStudents();
  }, []);

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (selectedStudentId && selectedStudentId !== 'new') {
      const s = agendaStudents.find(stu => String(stu.id) === selectedStudentId);
      if (s) {
        payload.customerId = String(s.id);
        payload.customerName = s.name;
        payload.customerEmail = s.email;
        payload.customerPhone = s.phone || '';
      }
    }

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo inscribir al alumno en la clase.');
      await loadBookings();
      const date = String(payload.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) setFocusDate(new Date(`${date}T12:00:00`));
      setShowNew(false);
      setSelectedStudentId('');
      setPrefillSession(null);
      demo(result.message ?? 'Inscripción confirmada.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo crear la inscripción.');
    } finally {
      setSaving(false);
    }
  }

  function handleEnrollInSession(session: CalendarSession) {
    setSelectedSessionKey(null);
    setSelectedStudentId('');
    const p = chileDateParts(new Date(session.starts_at * 1000));
    setPrefillSession({
      serviceId: String(session.service_id),
      professionalId: String(session.professional_id),
      date: localDateKey(new Date(session.starts_at * 1000)),
      time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    });
    setShowNew(true);
  }

  async function updateAttendance(bookingId: number, status: string) {
    try {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bookingId, status })
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo actualizar la asistencia.');
      await loadBookings();
      demo(status === 'attended' ? '✓ Asistencia marcada como Presente' : status === 'absent' ? 'Ausencia registrada' : 'Estado actualizado');
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al actualizar');
    }
  }

  async function cancelStudentEnrollment(bookingId: number, studentName: string) {
    if (!confirm(`¿Estás seguro de cancelar el cupo de ${studentName} para esta clase?`)) return;
    try {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bookingId, status: 'cancelled' })
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo cancelar el cupo.');
      await loadBookings();
      demo(`Cupo de ${studentName} cancelado.`);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al cancelar');
    }
  }

  async function notifyStudent(student: EnrolledStudent, channel: 'whatsapp' | 'email') {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: student.booking_id, target: 'student', channel })
      });
      const data = await response.json() as {
        reminders?: {
          student?: {
            whatsappUrl?: string | null;
            mailtoUrl?: string | null;
          };
        };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el recordatorio');
      if (channel === 'whatsapp' && data.reminders?.student?.whatsappUrl) {
        window.open(data.reminders.student.whatsappUrl, '_blank');
      } else if (channel === 'email' && data.reminders?.student?.mailtoUrl) {
        window.location.href = data.reminders.student.mailtoUrl;
      }
      demo(`✓ Recordatorio por ${channel === 'whatsapp' ? 'WhatsApp' : 'correo'} preparado para ${student.customer_name}`);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al enviar recordatorio');
    }
  }

  async function notifyInstructor(session: CalendarSession, channel: 'whatsapp' | 'email') {
    if (session.students.length === 0) {
      demo('No hay alumnos inscritos en esta clase para notificar.');
      return;
    }
    const firstBookingId = session.students[0].booking_id;
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: firstBookingId, target: 'instructor', channel })
      });
      const data = await response.json() as {
        reminders?: {
          instructor?: {
            whatsappUrl?: string | null;
            mailtoUrl?: string | null;
          };
        };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el aviso al instructor');
      if (channel === 'whatsapp' && data.reminders?.instructor?.whatsappUrl) {
        window.open(data.reminders.instructor.whatsappUrl, '_blank');
      } else if (channel === 'email' && data.reminders?.instructor?.mailtoUrl) {
        window.location.href = data.reminders.instructor.mailtoUrl;
      }
      demo(`✓ Recordatorio por ${channel === 'whatsapp' ? 'WhatsApp' : 'correo'} preparado para ${session.professional_name}`);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al avisar al instructor');
    }
  }

  async function notifyAllInSession(session: CalendarSession) {
    if (session.students.length === 0) {
      demo('No hay alumnos inscritos en esta clase aún.');
      return;
    }
    try {
      demo('Registrando recordatorios en el sistema para todos…');
      let count = 0;
      for (const stu of session.students) {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: stu.booking_id, target: 'both' })
        });
        count++;
      }
      demo(`✓ Recordatorios registrados para el instructor ${session.professional_name} y ${count} alumno(s) inscritos.`);
    } catch {
      demo('Ocurrió un error al registrar los recordatorios.');
    }
  }

  return (
    <div className="agenda-content">
      <div className="agenda-titlebar">
        <div>
          <p className="eyebrow">CONTROL DE CLASES Y CUPOS</p>
          <h1>Agenda de Clases</h1>
          <p>Supervisa el aforo, cupos ocupados y asistencia de tus alumnos.</p>
        </div>
        <div className="agenda-actions">
          <button className="primary" onClick={() => { setPrefillSession(null); setShowNew(true); }}>
            <span>＋</span> Agendar / Inscribir Alumno
          </button>
        </div>
      </div>

      <section className="agenda-toolbar">
        <div className="date-nav">
          <button onClick={() => setFocusDate(new Date())}>Hoy</button>
          <button aria-label={view === 'Semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => setFocusDate(d => addDays(d, view === 'Semana' ? -7 : -1))}>‹</button>
          <button aria-label={view === 'Semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => setFocusDate(d => addDays(d, view === 'Semana' ? 7 : 1))}>›</button>
          <strong>{label}</strong>
        </div>
        <div className="agenda-filters">
          <label>Instructor
            <select value={professional} onChange={e => setProfessional(e.target.value)}>
              <option value="Todos">Todos los instructores</option>
              {agendaTeam.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div className="view-switch">
            <button className={view === 'Semana' ? 'active' : ''} onClick={() => setView('Semana')}>Semana</button>
            <button className={view === 'Día' ? 'active' : ''} onClick={() => setView('Día')}>Día</button>
          </div>
        </div>
      </section>

      <div className="agenda-layout">
        <section className="calendar-card">
          <div className="calendar-scroll">
            <div
              className={view === 'Día' ? 'calendar-grid day-view' : 'calendar-grid'}
              style={{
                gridTemplateColumns: `62px repeat(${days.length}, minmax(105px, 1fr))`,
                gridTemplateRows: `56px ${totalGridHeight}px`
              } as CSSProperties}
            >
              <div className="corner-cell" />
              {days.map(d => {
                const isToday = localDateKey(d) === todayKey;
                return (
                  <div className={isToday ? 'day-head today' : 'day-head'} key={localDateKey(d)}>
                    <span>{new Intl.DateTimeFormat('es-CL', { weekday: 'short' }).format(d)}</span>
                    <strong>{d.getDate()}</strong>
                    {isToday && <em>Hoy</em>}
                  </div>
                );
              })}
              <div className="time-column" style={{ height: `${totalGridHeight}px` }}>
                {hours.map(h => (
                  <time key={h} style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }}>
                    {String(h).padStart(2, '0')}:00
                  </time>
                ))}
              </div>
              <div className="calendar-body" style={{ height: `${totalGridHeight}px` }}>
                {hours.map(h => (
                  <div
                    className="hour-line"
                    style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }}
                    key={h}
                  />
                ))}
                <div
                  className="hour-line"
                  style={{ top: `${totalGridHeight}px` }}
                />
                {days.map((_, i) => (
                  <div
                    className="day-line"
                    style={{ left: `${(i * 100) / days.length}%` }}
                    key={i}
                  />
                ))}
                {visibleSessions.map(session => {
                  const isGroup = session.class_type === 'grupal';
                  const enrolled = session.students.length;
                  const maxCap = session.capacity;
                  const capLabel = isGroup ? `👥 ${enrolled}/${maxCap} alumnos` : (session.students[0]?.customer_name || 'Individual');
                  const allAttended = enrolled > 0 && session.students.every(s => s.status === 'attended');
                  const hasAbsent = session.students.some(s => s.status === 'absent');
                  const statusIcon = allAttended ? '✓ ' : hasAbsent ? '⚠️ ' : '';

                  return (
                    <button
                      key={session.sessionKey}
                      className={`calendar-event ${session.color}`}
                      style={{
                        left: `calc(${session.day * (100 / days.length)}% + 5px)`,
                        width: `calc(${100 / days.length}% - 10px)`,
                        top: `${Math.max(0, (session.start - START_HOUR) * HOUR_HEIGHT + 4)}px`,
                        height: `${Math.max(46, session.span * HOUR_HEIGHT - 8)}px`
                      }}
                      onClick={() => setSelectedSessionKey(session.sessionKey)}
                    >
                      <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', color: '#0f172a' }}>
                        {statusIcon}{session.service_name}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#475569' }}>
                        {session.professional_name}
                      </span>
                      <small style={{ fontSize: '11px', color: '#18181b', fontWeight: 600 }}>
                        {String(Math.floor(session.start)).padStart(2, '0')}:{String(Math.round((session.start % 1) * 60)).padStart(2, '0')} · {capLabel}
                      </small>
                    </button>
                  );
                })}
                {loading && <div className="calendar-loading">Cargando clases…</div>}
              </div>
            </div>
          </div>
        </section>

        <aside className="agenda-side">
          <section className="day-summary">
            <p className="eyebrow">{new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric' }).format(summaryDate)}</p>
            <h2>Resumen del día</h2>
            <div>
              <span><b>{summaryBookings.length}</b><small>Inscritos</small></span>
              <span><b>{Math.floor(occupiedMinutes / 60)}h {occupiedMinutes % 60}m</b><small>Horas clase</small></span>
              <span><b>${summaryIncome.toLocaleString('es-CL')}</b><small>Al día / Pagado</small></span>
            </div>
          </section>
          <section className="team-legend">
            <h3>Instructores</h3>
            <button className={professional === 'Todos' ? 'active' : ''} onClick={() => setProfessional('Todos')}>
              <i className="all-dot" />
              <span>
                <strong>Todos los instructores</strong>
                <small>{savedBookings.filter(b => days.some(d => localDateKey(d) === bookingDateKey(b.starts_at))).length} alumnos en agenda</small>
              </span>
            </button>
            {agendaTeam.map((m, index) => (
              <button
                className={professional === String(m.id) ? 'active' : ''}
                onClick={() => setProfessional(String(m.id))}
                key={m.id}
              >
                <i style={{ background: m.color || ['#7659e8', '#31aa86', '#ed8060'][index % 3] }} />
                <span>
                  <strong>{m.name}</strong>
                  <small>{savedBookings.filter(b => b.professional_id === m.id && days.some(d => localDateKey(d) === bookingDateKey(b.starts_at))).length} alumnos</small>
                </span>
              </button>
            ))}
          </section>
        </aside>
      </div>

      {/* Modal: Detalle de la Clase y Alumnos Inscritos */}
      {activeSession && (
        <div className="modal-backdrop" onClick={() => setSelectedSessionKey(null)}>
          <article className="booking-detail" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <button className="close-modal" onClick={() => setSelectedSessionKey(null)}>×</button>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <span className={`detail-status ${activeSession.students.length >= activeSession.capacity ? 'pending' : 'paid'}`}>
                {activeSession.students.length >= activeSession.capacity ? 'Cupos completos' : `${activeSession.capacity - activeSession.students.length} cupos disponibles`}
              </span>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: '#f4f4f5', color: '#27272a', border: '1px solid #d4d4d8', fontWeight: 600 }}>
                {activeSession.class_type === 'grupal' ? `👥 Grupal (Cap. max: ${activeSession.capacity})` : '👤 Individual (1 a 1)'}
              </span>
            </div>
            <h2>{activeSession.service_name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', margin: '0 0 16px' }}>
              <p style={{ margin: 0, color: '#475569', fontSize: '14px' }}>
                Instructor: <strong>{activeSession.professional_name}</strong> · {new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(activeSession.starts_at * 1000))} ({Math.round(activeSession.span * 60)} min)
              </p>
              {activeSession.students.length > 0 && (
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  <button
                    type="button"
                    title={`Enviar recordatorio de clase al instructor ${activeSession.professional_name} por WhatsApp`}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #d4d4d8',
                      background: '#ffffff',
                      color: '#27272a',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={() => void notifyInstructor(activeSession, 'whatsapp')}
                  >
                    📲 WhatsApp Instructor
                  </button>
                  <button
                    type="button"
                    title={`Enviar aviso de clase al instructor ${activeSession.professional_name} por Correo`}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #d4d4d8',
                      background: '#ffffff',
                      color: '#27272a',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={() => void notifyInstructor(activeSession, 'email')}
                  >
                    ✉️ Correo Instructor
                  </button>
                </div>
              )}
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <strong style={{ fontSize: '14px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  👥 Alumnos inscritos ({activeSession.students.length} de {activeSession.capacity})
                </strong>
                {activeSession.students.length < activeSession.capacity && (
                  <button
                    type="button"
                    style={{
                      background: '#f4f4f5',
                      border: '1px solid #d4d4d8',
                      color: '#27272a',
                      padding: '5px 10px',
                      borderRadius: '7px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    onClick={() => handleEnrollInSession(activeSession)}
                  >
                    ＋ Inscribir alumno
                  </button>
                )}
              </div>

              {activeSession.students.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', margin: '20px 0' }}>
                  No hay alumnos inscritos en esta clase aún.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {activeSession.students.map((stu, sIdx) => (
                    <div
                      key={stu.booking_id}
                      className="session-student-row"
                    >
                      <div className="session-student-info">
                        <div className={`customer-avatar tone-${sIdx % 4}`} style={{ width: '34px', height: '34px', fontSize: '12px', flexShrink: 0 }}>
                          {initials(stu.customer_name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {stu.customer_name}
                          </strong>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: stu.membership_status === 'active' ? '#ecfdf5' : '#fef2f2',
                              color: stu.membership_status === 'active' ? '#047857' : '#b91c1c',
                              border: stu.membership_status === 'active' ? '1px solid #a7f3d0' : '1px solid #fecaca',
                              fontWeight: 600
                            }}>
                              {stu.membership_status === 'active' ? '🟢 Al día' : '🔴 Cuota pendiente'}
                            </span>
                            <small style={{ color: '#64748b', fontSize: '11px' }}>{stu.customer_phone || stu.customer_email || 'Sin WhatsApp'}</small>
                          </div>
                        </div>
                      </div>

                      <div className="session-student-actions">
                        <button
                          type="button"
                          title="Marcar Asistencia: Presente"
                          style={{
                            padding: '6px 9px',
                            borderRadius: '7px',
                            border: '1px solid #a7f3d0',
                            background: stu.status === 'attended' ? '#10b981' : '#ecfdf5',
                            color: stu.status === 'attended' ? '#ffffff' : '#047857',
                            fontWeight: 600,
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                          onClick={() => void updateAttendance(stu.booking_id, 'attended')}
                        >
                          ✓ Presente
                        </button>
                        <button
                          type="button"
                          title="Marcar Ausencia"
                          style={{
                            padding: '6px 9px',
                            borderRadius: '7px',
                            border: '1px solid #fecaca',
                            background: stu.status === 'absent' ? '#ef4444' : '#fef2f2',
                            color: stu.status === 'absent' ? '#ffffff' : '#b91c1c',
                            fontWeight: 600,
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                          onClick={() => void updateAttendance(stu.booking_id, 'absent')}
                        >
                          ✗ Ausente
                        </button>
                        {stu.customer_phone && (
                          <button
                            type="button"
                            title="Enviar recordatorio por WhatsApp al alumno"
                            style={{
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: '1px solid #bbf7d0',
                              background: '#f0fdf4',
                              color: '#16a34a',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={() => void notifyStudent(stu, 'whatsapp')}
                          >
                            💬 WA
                          </button>
                        )}
                        {stu.customer_email && (
                          <button
                            type="button"
                            title="Enviar recordatorio por Correo al alumno"
                            style={{
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: '1px solid #e4e4e7',
                              background: '#ffffff',
                              color: '#27272a',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={() => void notifyStudent(stu, 'email')}
                          >
                            ✉️
                          </button>
                        )}
                        <button
                          type="button"
                          title="Cancelar cupo de este alumno"
                          style={{
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                          onClick={() => void cancelStudentEnrollment(stu.booking_id, stu.customer_name)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {activeSession.students.length > 0 && (
                  <button
                    type="button"
                    style={{
                      background: '#ffffff',
                      border: '1px solid #d4d4d8',
                      color: '#27272a',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    onClick={() => void notifyAllInSession(activeSession)}
                  >
                    🔔 Recordar a Instructor y Alumnos
                  </button>
                )}
                {activeSession.students.length < activeSession.capacity ? (
                  <button
                    type="button"
                    className="primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => handleEnrollInSession(activeSession)}
                  >
                    <span>＋</span> Inscribir alumno
                  </button>
                ) : (
                  <span style={{ fontSize: '13px', color: '#64748b' }}>🔒 Cupos completos para esta clase</span>
                )}
              </div>
              <button type="button" onClick={() => setSelectedSessionKey(null)}>
                Cerrar
              </button>
            </div>
          </article>
        </div>
      )}

      {/* Modal: Agendar / Inscribir Alumno */}
      {showNew && (
        <div className="modal-backdrop">
          <form className="new-booking-modal" onSubmit={createBooking} style={{ maxWidth: '580px' }}>
            <button type="button" className="close-modal" onClick={() => setShowNew(false)}>×</button>
            <p className="eyebrow">INSCRIBIR A CLASE</p>
            <h2>Asignar Cupo para Alumno</h2>
            <p>Selecciona la clase, el instructor y el alumno para asegurar su lugar.</p>

            <div className="form-grid">
              <label className="full">Seleccionar Alumno
                <select
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                >
                  <option value="">-- Seleccionar de la lista de alumnos --</option>
                  {agendaStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.plan_name || 'Regular'} ({s.membership_status === 'active' ? '🟢 Al día' : '🔴 Cuota pendiente'})
                    </option>
                  ))}
                  <option value="new">+ Escribir datos de un alumno nuevo</option>
                </select>
              </label>

              {(!selectedStudentId || selectedStudentId === 'new') && (
                <>
                  <label className="full">Nombre del alumno
                    <input name="customerName" required placeholder="Ej: Carolina González" />
                  </label>
                  <label>Correo electrónico
                    <input name="customerEmail" type="email" required placeholder="alumno@correo.cl" />
                  </label>
                  <label>Teléfono (WhatsApp)
                    <input name="customerPhone" type="tel" placeholder="+56 9 1234 5678" />
                  </label>
                </>
              )}

              <label className="full">Clase / Disciplina
                <select name="serviceId" required defaultValue={prefillSession?.serviceId ?? ''} key={`serv-${prefillSession?.serviceId}`}>
                  <option value="" disabled>Seleccionar clase</option>
                  {agendaServices.map(s => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {s.class_type === 'grupal' ? `👥 Grupal (Cupo max: ${s.capacity || 10})` : '👤 Individual'} {s.schedule ? `· 🕒 ${s.schedule}` : ''} · ${Number(s.price_clp).toLocaleString('es-CL')}
                    </option>
                  ))}
                </select>
              </label>

              <label>Instructor
                <select name="professionalId" required defaultValue={prefillSession?.professionalId ?? ''} key={`prof-${prefillSession?.professionalId}`}>
                  <option value="" disabled>Seleccionar instructor</option>
                  {agendaTeam.map(m => (
                    <option value={m.id} key={m.id}>{m.name} · {m.role}</option>
                  ))}
                </select>
              </label>

              <label>Fecha
                <input name="date" type="date" min={localDateKey(new Date())} defaultValue={prefillSession?.date ?? localDateKey(focusDate)} key={`date-${prefillSession?.date}`} required />
              </label>

              <label>Hora de inicio
                <input name="time" type="time" min="07:00" max="22:00" step="900" defaultValue={prefillSession?.time ?? '10:00'} key={`time-${prefillSession?.time}`} required />
              </label>

              <label className="full">Notas de la sesión
                <textarea name="notes" rows={2} placeholder="Objetivos para la clase, material requerido o recordatorios (opcional)" />
              </label>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="submit" disabled={saving || agendaServices.length === 0 || agendaTeam.length === 0}>
                {saving ? 'Guardando…' : 'Confirmar Cupo'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type BookingRow = {
  id: number;
  service_id: number;
  professional_id: number;
  customer_id: number;
  starts_at: number;
  ends_at: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'attended';
  payment_status: 'paid' | 'unpaid' | 'partial' | 'refunded';
  amount_clp: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  plan_name: string | null;
  membership_status: string;
  service_name: string;
  class_type: 'individual' | 'grupal';
  capacity: number;
  professional_name: string;
  professional_color: string;
  professional_email?: string;
  professional_phone?: string | null;
  enrolled_count: number;
};

function BookingsModule({ demo }: { demo: (message: string) => void }) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [students, setStudents] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'todos' | 'hoy' | 'semana' | 'mes' | 'proximas' | 'historial'>('todos');
  const [instructorFilter, setInstructorFilter] = useState('todos');
  const [serviceFilter, setServiceFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const [showNew, setShowNew] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [rescheduling, setRescheduling] = useState<BookingRow | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<BookingRow | null>(null);
  const [reminderModal, setReminderModal] = useState<{
    booking: BookingRow;
    loading: boolean;
    data?: {
      student: {
        name: string;
        email: string;
        phone: string | null;
        whatsappUrl: string | null;
        mailtoUrl: string | null;
        whatsappMessage: string;
        emailSubject: string;
        emailBody: string;
      };
      instructor: {
        name: string;
        email: string;
        phone: string | null;
        whatsappUrl: string | null;
        mailtoUrl: string | null;
        whatsappMessage: string;
        emailSubject: string;
        emailBody: string;
      };
    };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function loadData() {
    try {
      const [bookRes, servRes, teamRes, custRes] = await Promise.all([
        fetch('/api/bookings?includeCancelled=1', { cache: 'no-store' }),
        fetch('/api/services', { cache: 'no-store' }),
        fetch('/api/team', { cache: 'no-store' }),
        fetch('/api/customers', { cache: 'no-store' }),
      ]);
      if (bookRes.ok) {
        const d = (await bookRes.json()) as { bookings: BookingRow[] };
        setBookings(d.bookings || []);
      }
      if (servRes.ok) {
        const d = (await servRes.json()) as { services: Service[] };
        setServices(d.services || []);
      }
      if (teamRes.ok) {
        const d = (await teamRes.json()) as { team: TeamMember[] };
        setTeam(d.team || []);
      }
      if (custRes.ok) {
        const d = (await custRes.json()) as { customers: Customer[] };
        setStudents(d.customers || []);
      }
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al cargar las reservas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const nowSec = Math.floor(Date.now() / 1000);
  const todayKey = localDateKey(new Date());

  // Metrics
  const todayCount = bookings.filter((b) => bookingDateKey(b.starts_at) === todayKey && b.status !== 'cancelled').length;
  const upcomingCount = bookings.filter((b) => b.starts_at >= nowSec && b.status !== 'cancelled').length;
  const completedCount = bookings.filter((b) => b.status === 'completed').length;
  const noShowCount = bookings.filter((b) => b.status === 'no_show').length;
  const groupBookings = bookings.filter((b) => b.class_type === 'grupal' && b.status !== 'cancelled');
  const avgOccupancy = groupBookings.length > 0
    ? Math.min(100, Math.round((groupBookings.reduce((sum, b) => sum + (b.enrolled_count / (b.capacity || 10)), 0) / groupBookings.length) * 100))
    : 0;

  // Filter logic
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const currentWeekEnd = addDays(currentWeekStart, 7);

  const filtered = bookings.filter((b) => {
    // Search query
    const searchTarget = `${b.customer_name} ${b.customer_email} ${b.customer_phone ?? ''} ${b.service_name} ${b.professional_name}`.toLowerCase();
    if (query && !searchTarget.includes(query.toLowerCase())) return false;

    // Date filter
    const bDate = new Date(b.starts_at * 1000);
    const bKey = bookingDateKey(b.starts_at);
    if (dateFilter === 'hoy' && bKey !== todayKey) return false;
    if (dateFilter === 'semana') {
      if (bDate < currentWeekStart || bDate > currentWeekEnd) return false;
    }
    if (dateFilter === 'mes') {
      if (bDate.getFullYear() !== now.getFullYear() || bDate.getMonth() !== now.getMonth()) return false;
    }
    if (dateFilter === 'proximas' && (b.starts_at < nowSec || b.status === 'cancelled')) return false;
    if (dateFilter === 'historial' && b.starts_at >= nowSec) return false;

    // Dropdown filters
    if (instructorFilter !== 'todos' && String(b.professional_id) !== instructorFilter) return false;
    if (serviceFilter !== 'todos' && String(b.service_id) !== serviceFilter) return false;
    if (statusFilter !== 'todos' && b.status !== statusFilter) return false;

    return true;
  });

  async function updateStatus(id: number, newStatus: string) {
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo actualizar la asistencia.');
      await loadData();
      demo(newStatus === 'completed' ? '✓ Asistencia confirmada.' : newStatus === 'no_show' ? 'Ausencia registrada.' : 'Estado de reserva actualizado.');
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al actualizar.');
    }
  }

  async function togglePayment(b: BookingRow) {
    const nextPayment = b.payment_status === 'paid' ? 'unpaid' : 'paid';
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, paymentStatus: nextPayment }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo actualizar el pago.');
      await loadData();
      demo(nextPayment === 'paid' ? 'Marcado como pagado / incluido.' : 'Marcado como pago pendiente.');
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al actualizar pago.');
    }
  }

  function openWhatsApp(b: BookingRow) {
    if (!b.customer_phone) {
      demo(`El alumno ${b.customer_name} no tiene teléfono registrado.`);
      return;
    }
    const phoneClean = b.customer_phone.replace(/\D/g, '');
    const dateFormatted = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(b.starts_at * 1000));
    const text = encodeURIComponent(
      `Hola ${b.customer_name}! Te recordamos tu clase de ${b.service_name} con ${b.professional_name} agendada para el ${dateFormatted}. Por favor confírmanos si asistirás. Te esperamos!`
    );
    window.open(`https://wa.me/${phoneClean}?text=${text}`, '_blank');
  }

  async function openReminderModal(b: BookingRow) {
    setReminderModal({ booking: b, loading: true });
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id, target: 'both' }),
      });
      const data = (await res.json()) as {
        reminders?: {
          student: {
            name: string;
            email: string;
            phone: string | null;
            whatsappUrl: string | null;
            mailtoUrl: string | null;
            whatsappMessage: string;
            emailSubject: string;
            emailBody: string;
          };
          instructor: {
            name: string;
            email: string;
            phone: string | null;
            whatsappUrl: string | null;
            mailtoUrl: string | null;
            whatsappMessage: string;
            emailSubject: string;
            emailBody: string;
          };
        };
        error?: string;
      };
      if (!res.ok || !data.reminders) {
        throw new Error(data.error || 'No se pudieron preparar los recordatorios.');
      }
      setReminderModal({ booking: b, loading: false, data: data.reminders });
    } catch (err) {
      demo(err instanceof Error ? err.message : 'Error al obtener recordatorios.');
      setReminderModal(null);
    }
  }

  async function submitReschedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rescheduling) return;
    setSaving(true);
    setFormError('');
    const form = new FormData(e.currentTarget);
    const date = String(form.get('date'));
    const time = String(form.get('time'));
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rescheduling.id, date, time }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo reagendar.');
      await loadData();
      setRescheduling(null);
      demo(data.message ?? 'Reserva reagendada con éxito.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al reagendar.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(id: number, permanent = false) {
    setSaving(true);
    setFormError('');
    try {
      if (permanent) {
        const res = await fetch(`/api/bookings?id=${id}`, { method: 'DELETE' });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) throw new Error(data.error ?? 'No se pudo eliminar la reserva.');
      } else {
        const res = await fetch('/api/bookings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'cancelled' }),
        });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) throw new Error(data.error ?? 'No se pudo cancelar la reserva.');
      }
      await loadData();
      setConfirmCancel(null);
      demo(permanent ? 'Reserva eliminada definitivamente.' : 'Reserva cancelada (cupo liberado).');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al procesar la cancelación.');
    } finally {
      setSaving(false);
    }
  }

  async function createBooking(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (selectedStudentId && selectedStudentId !== 'new') {
      payload.customerId = selectedStudentId;
    }
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear la reserva.');
      await loadData();
      setShowNew(false);
      setSelectedStudentId('');
      demo(data.message ?? 'Inscripción confirmada.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar la reserva.');
    } finally {
      setSaving(false);
    }
  }

  function initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join('')
      .toUpperCase();
  }

  return (
    <div className="bookings-content">
      <div className="bookings-titlebar">
        <div>
          <p className="eyebrow">CONTROL DE RESERVAS E INSCRIPCIONES</p>
          <h1>Reservas</h1>
          <p>Supervisa las inscripciones de tus alumnos, toma asistencia y administra los cupos en tiempo real.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setShowNew(true);
            setFormError('');
          }}
        >
          <span>＋</span> Nueva Reserva / Inscribir Alumno
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="bookings-stats">
        <article>
          <span className="purple">📅</span>
          <div>
            <small>Reservas Hoy</small>
            <strong>{todayCount}</strong>
          </div>
        </article>
        <article>
          <span className="mint">👥</span>
          <div>
            <small>Próximas Sesiones</small>
            <strong>{upcomingCount}</strong>
          </div>
        </article>
        <article>
          <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>✓</span>
          <div>
            <small>Asistencias</small>
            <strong style={{ color: '#60a5fa' }}>{completedCount}</strong>
          </div>
        </article>
        <article>
          <span className="coral">⚠️</span>
          <div>
            <small>Ausencias / No-Show</small>
            <strong style={{ color: '#f87171' }}>{noShowCount}</strong>
          </div>
        </article>
        <article>
          <span className="gold">📈</span>
          <div>
            <small>Ocupación Cupos</small>
            <strong style={{ color: '#fcd34d' }}>{avgOccupancy}%</strong>
          </div>
        </article>
      </div>

      {/* Main Panel */}
      <section className="bookings-panel">
        <div className="bookings-toolbar">
          <div className="bookings-toolbar-row1">
            <div className="bookings-search">
              <span>⌕</span>
              <input
                aria-label="Buscar reserva"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por alumno, teléfono, clase o instructor..."
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Fecha:</span>
              {(['todos', 'hoy', 'semana', 'mes', 'proximas', 'historial'] as const).map((df) => (
                <button
                  key={df}
                  className={`filter-btn-pill ${dateFilter === df ? 'active' : ''}`}
                  onClick={() => setDateFilter(df)}
                >
                  {df === 'todos'
                    ? 'Todas'
                    : df === 'hoy'
                    ? 'Hoy'
                    : df === 'semana'
                    ? 'Esta Semana'
                    : df === 'mes'
                    ? 'Este Mes'
                    : df === 'proximas'
                    ? 'Próximas'
                    : 'Historial'}
                </button>
              ))}
            </div>
          </div>

          <div className="bookings-toolbar-row2">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Instructor:</span>
              <select
                className="filter-select"
                value={instructorFilter}
                onChange={(e) => setInstructorFilter(e.target.value)}
              >
                <option value="todos">Todos los instructores</option>
                {team.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Clase:</span>
              <select
                className="filter-select"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              >
                <option value="todos">Todas las clases</option>
                {services.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} ({s.class_type === 'grupal' ? 'Grupal' : 'Individual'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Estado:</span>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="todos">Todos los estados</option>
                <option value="confirmed">🟢 Confirmadas</option>
                <option value="completed">🔵 Asistió / Completada</option>
                <option value="no_show">⚪ Ausente / No asistió</option>
                <option value="cancelled">🔴 Canceladas</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bookings-table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>Fecha y Horario</th>
                <th>Alumno</th>
                <th>Clase y Aforo</th>
                <th>Instructor</th>
                <th>Asistencia</th>
                <th>Pago</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    Cargando reservas…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>◫</div>
                    <strong style={{ display: 'block', color: '#0f172a', fontSize: '15px' }}>
                      No se encontraron reservas
                    </strong>
                    <small style={{ color: '#64748b' }}>Ajusta los filtros o inscribe a un alumno con el botón superior.</small>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const bDate = new Date(b.starts_at * 1000);
                  const isToday = bookingDateKey(b.starts_at) === todayKey;
                  const dayName = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).format(bDate);
                  const pStart = chileDateParts(bDate);
                  const pEnd = chileDateParts(new Date(b.ends_at * 1000));
                  const timeFormatted = `${pStart.hour}:${pStart.minute} - ${pEnd.hour}:${pEnd.minute}`;

                  const maxCap = b.class_type === 'grupal' ? (b.capacity || 10) : 1;
                  const isFull = b.class_type === 'grupal' && b.enrolled_count >= maxCap;

                  return (
                    <tr key={b.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>{dayName}</strong>
                          {isToday && (
                            <span style={{ background: '#e4e4e7', color: '#27272a', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                              HOY
                            </span>
                          )}
                        </div>
                        <small>{timeFormatted} hrs</small>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: '#e4e4e7',
                              color: '#27272a',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: '12px',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {initials(b.customer_name)}
                          </span>
                          <div>
                            <strong>{b.customer_name}</strong>
                            <small>{b.customer_phone || b.customer_email}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <strong>{b.service_name}</strong>
                        <div style={{ marginTop: '4px' }}>
                          {b.class_type === 'grupal' ? (
                            <span className={`capacity-pill ${isFull ? 'full' : 'normal'}`}>
                              👥 {b.enrolled_count}/{maxCap} {isFull ? 'LLENO' : 'cupos'}
                            </span>
                          ) : (
                            <span className="capacity-pill individual">
                              👤 1 a 1 Particular
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: b.professional_color || '#7559f2',
                            }}
                          />
                          <strong style={{ fontSize: '13px' }}>{b.professional_name}</strong>
                        </div>
                      </td>

                      <td>
                        <select
                          className={`attendance-select ${b.status === 'attended' ? 'completed' : b.status}`}
                          value={b.status === 'attended' ? 'completed' : b.status}
                          onChange={(e) => void updateStatus(b.id, e.target.value)}
                        >
                          <option value="confirmed">🟢 Confirmada</option>
                          <option value="completed">🔵 Asistió</option>
                          <option value="no_show">⚪ Ausente</option>
                          <option value="cancelled">🔴 Cancelada</option>
                        </select>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`payment-pill ${b.payment_status === 'paid' ? 'paid' : 'unpaid'}`}
                          title="Clic para alternar estado de pago"
                          onClick={() => void togglePayment(b)}
                        >
                          {b.payment_status === 'paid' ? '✓ Al día / Pagado' : '⏳ Pendiente'}
                        </button>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="action-btn-icon"
                            title="Recordatorios por WhatsApp y Correo (Alumno e Instructor)"
                            onClick={() => void openReminderModal(b)}
                          >
                            🔔
                          </button>
                          <button
                            type="button"
                            className="action-btn-icon"
                            title="Reagendar fecha u hora"
                            onClick={() => {
                              setRescheduling(b);
                              setFormError('');
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="action-btn-icon delete"
                            title="Cancelar o eliminar reserva"
                            onClick={() => {
                              setConfirmCancel(b);
                              setFormError('');
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Nueva Reserva / Inscribir Alumno */}
      {showNew && (
        <div className="modal-backdrop">
          <form className="new-booking-modal" onSubmit={createBooking} style={{ maxWidth: '580px' }}>
            <button type="button" className="close-modal" onClick={() => setShowNew(false)}>×</button>
            <p className="eyebrow">INSCRIBIR A CLASE</p>
            <h2>Asignar Cupo para Alumno</h2>
            <p>Selecciona la clase, el instructor y el alumno para asegurar su lugar.</p>

            <div className="form-grid">
              <label className="full">Seleccionar Alumno
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                >
                  <option value="">-- Seleccionar de la lista de alumnos --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.plan_name || 'Regular'} ({s.membership_status === 'active' ? '🟢 Al día' : s.membership_status === 'inactive' ? '⚪ Dado de baja' : '🔴 Cuota pendiente'})
                    </option>
                  ))}
                  <option value="new">+ Escribir datos de un alumno nuevo</option>
                </select>
              </label>

              {(!selectedStudentId || selectedStudentId === 'new') && (
                <>
                  <label className="full">Nombre del alumno
                    <input name="customerName" required placeholder="Ej: Carolina González" />
                  </label>
                  <label>Correo electrónico
                    <input name="customerEmail" type="email" required placeholder="alumno@correo.cl" />
                  </label>
                  <label>Teléfono (WhatsApp)
                    <input name="customerPhone" type="tel" placeholder="+56 9 1234 5678" />
                  </label>
                </>
              )}

              <label className="full">Clase / Disciplina
                <select name="serviceId" required defaultValue="">
                  <option value="" disabled>Seleccionar clase</option>
                  {services.filter(s => Boolean(s.active)).map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {s.class_type === 'grupal' ? `👥 Grupal (Cupo max: ${s.capacity || 10})` : '👤 Individual'} {s.schedule ? `· 🕒 ${s.schedule}` : ''} · ${Number(s.price_clp).toLocaleString('es-CL')}
                    </option>
                  ))}
                </select>
              </label>

              <label>Instructor
                <select name="professionalId" required defaultValue="">
                  <option value="" disabled>Seleccionar instructor</option>
                  {team.filter(m => Boolean(m.active)).map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name} · {m.role}
                    </option>
                  ))}
                </select>
              </label>

              <label>Fecha
                <input name="date" type="date" min={todayKey} defaultValue={todayKey} required />
              </label>

              <label>Hora de inicio
                <input name="time" type="time" min="07:00" max="21:00" step="900" defaultValue="18:00" required />
              </label>

              <label className="full">Notas de la sesión
                <textarea name="notes" rows={2} placeholder="Observaciones o indicaciones especiales (opcional)" />
              </label>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="submit" disabled={saving || services.length === 0 || team.length === 0}>
                {saving ? 'Guardando…' : 'Confirmar Cupo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Reagendar Reserva */}
      {rescheduling && (
        <div className="modal-backdrop">
          <form className="new-booking-modal" onSubmit={submitReschedule} style={{ maxWidth: '480px' }}>
            <button type="button" className="close-modal" onClick={() => setRescheduling(null)}>×</button>
            <p className="eyebrow">REAGENDAR SESIÓN</p>
            <h2>Cambiar fecha y hora</h2>
            <p>
              Reagendando clase de <strong>{rescheduling.service_name}</strong> para el alumno <strong>{rescheduling.customer_name}</strong> con <strong>{rescheduling.professional_name}</strong>.
            </p>

            <div className="form-grid">
              <label>Nueva fecha
                <input
                  name="date"
                  type="date"
                  min={todayKey}
                  defaultValue={bookingDateKey(rescheduling.starts_at)}
                  required
                />
              </label>
              <label>Nuevo horario
                <input
                  name="time"
                  type="time"
                  min="07:00"
                  max="21:00"
                  step="900"
                  defaultValue={`${chileDateParts(new Date(rescheduling.starts_at * 1000)).hour}:${chileDateParts(new Date(rescheduling.starts_at * 1000)).minute}`}
                  required
                />
              </label>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setRescheduling(null)}>Cancelar</button>
              <button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Confirmar nuevo horario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cancelar / Eliminar Reserva */}
      {confirmCancel && (
        <div className="modal-backdrop">
          <div className="new-booking-modal" style={{ maxWidth: '500px' }}>
            <button type="button" className="close-modal" onClick={() => setConfirmCancel(null)}>×</button>
            <p className="eyebrow" style={{ color: '#ef4444' }}>GESTIÓN DE RESERVA</p>
            <h2>¿Cancelar o eliminar reserva?</h2>
            <p>
              Reserva de <strong>{confirmCancel.customer_name}</strong> para la clase de <strong>{confirmCancel.service_name}</strong>.
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px',
                margin: '16px 0',
                fontSize: '13px',
                color: '#475569',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: '#0f172a', display: 'block', marginBottom: '6px' }}>
                💡 Opciones disponibles:
              </strong>
              <div style={{ marginBottom: '8px' }}>
                • <strong>Cancelar reserva:</strong> Libera el cupo inmediatamente para otro alumno, pero mantiene el registro como cancelada en el historial.
              </div>
              <div>
                • <strong>Eliminar definitivamente:</strong> Remueve por completo la reserva de la base de datos.
              </div>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                style={{
                  background: '#f59e0b',
                  color: '#1e293b',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
                disabled={saving}
                onClick={() => void cancelBooking(confirmCancel.id, false)}
              >
                ⏸️ Cancelar reserva (Liberar cupo para otro alumno)
              </button>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setConfirmCancel(null)} disabled={saving}>
                  Volver
                </button>
                <button
                  type="button"
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  disabled={saving}
                  onClick={() => void cancelBooking(confirmCancel.id, true)}
                >
                  {saving ? 'Eliminando…' : '🗑️ Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Recordatorio de Reserva (Alumno e Instructor) */}
      {reminderModal && (
        <div className="modal-backdrop" onClick={() => setReminderModal(null)}>
          <div
            className="new-booking-modal"
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="close-modal" onClick={() => setReminderModal(null)}>×</button>
            <p className="eyebrow" style={{ color: '#27272a' }}>RECORDATORIOS DE RESERVA</p>
            <h2>Notificación a Alumno e Instructor</h2>
            <p style={{ margin: '0 0 16px', color: '#52525b', fontSize: '14px' }}>
              Clase: <strong>{reminderModal.booking.service_name}</strong> ·{' '}
              {new Intl.DateTimeFormat('es-CL', {
                timeZone: 'America/Santiago',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit'
              }).format(new Date(reminderModal.booking.starts_at * 1000))} hrs
            </p>

            {reminderModal.loading ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#71717a' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                Generando recordatorios y registrando en sistema…
              </div>
            ) : reminderModal.data ? (
              <div style={{ display: 'grid', gap: '16px' }}>
                {/* Tarjeta Alumno */}
                <div style={{
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>👤</span>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#18181b', display: 'block' }}>
                          Alumno: {reminderModal.data.student.name}
                        </strong>
                        <small style={{ color: '#71717a' }}>
                          {reminderModal.data.student.phone || 'Sin teléfono'} · {reminderModal.data.student.email}
                        </small>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {reminderModal.data.student.whatsappUrl ? (
                        <a
                          href={reminderModal.data.student.whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: '#25D366',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>💬</span> WhatsApp
                        </a>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#a1a1aa', padding: '4px 8px' }}>Sin WhatsApp</span>
                      )}
                      {reminderModal.data.student.mailtoUrl && (
                        <a
                          href={reminderModal.data.student.mailtoUrl}
                          style={{
                            background: '#27272a',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>✉️</span> Correo
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    color: '#3f3f46',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '80px',
                    overflowY: 'auto'
                  }}>
                    {reminderModal.data.student.whatsappMessage}
                  </div>
                </div>

                {/* Tarjeta Instructor */}
                <div style={{
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>📋</span>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#18181b', display: 'block' }}>
                          Instructor: {reminderModal.data.instructor.name}
                        </strong>
                        <small style={{ color: '#71717a' }}>
                          {reminderModal.data.instructor.phone || 'Sin teléfono'} · {reminderModal.data.instructor.email}
                        </small>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {reminderModal.data.instructor.whatsappUrl ? (
                        <a
                          href={reminderModal.data.instructor.whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: '#25D366',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>💬</span> WhatsApp
                        </a>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#a1a1aa', padding: '4px 8px' }}>Sin WhatsApp</span>
                      )}
                      {reminderModal.data.instructor.mailtoUrl && (
                        <a
                          href={reminderModal.data.instructor.mailtoUrl}
                          style={{
                            background: '#27272a',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>✉️</span> Correo
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    color: '#3f3f46',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '80px',
                    overflowY: 'auto'
                  }}>
                    {reminderModal.data.instructor.whatsappMessage}
                  </div>
                </div>

                <div style={{
                  fontSize: '12px',
                  color: '#71717a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px'
                }}>
                  <span>✓</span> Ambas alertas quedan registradas en el historial de Notificaciones del sistema.
                </div>
              </div>
            ) : null}

            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button type="button" onClick={() => setReminderModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  plan_name: string | null;
  monthly_fee: number;
  payment_due_day: number;
  membership_status: 'active' | 'pending' | 'overdue' | 'inactive';
  last_payment_date: number | null;
  next_payment_due: number | null;
  notify_email: number | boolean;
  notify_whatsapp: number | boolean;
  booking_count: number;
  paid_total: number;
  last_booking: number | null;
};
type Visit = { id: number; customer_id: number; starts_at: number; status: string; payment_status: string; amount_clp: number; service_name: string; professional_name: string };
type StudentPayment = { id: number; customer_id: number; amount: number; payment_date: number; period: string; payment_method: string; notes: string | null };
type StudentNotification = { id: number; customer_id: number; type: string; channel: string; subject: string; message: string; status: string; sent_at: number | null };

function ClientsModule({ demo }: { demo: (message: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, overdue: 0, inactive: 0, monthlyRevenue: 0 });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'active' | 'pending' | 'overdue' | 'inactive'>('todos');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [planNameInput, setPlanNameInput] = useState<string>('');
  const [monthlyFeeInput, setMonthlyFeeInput] = useState<number | string>(45000);
  const [payingStudent, setPayingStudent] = useState<Customer | null>(null);
  const [notifyingStudent, setNotifyingStudent] = useState<Customer | null>(null);
  const [notifType, setNotifType] = useState<'payment_due' | 'class_reminder' | 'custom'>('payment_due');
  const [notifMessage, setNotifMessage] = useState('');
  const [drawerTab, setDrawerTab] = useState<'resumen' | 'pagos' | 'clases' | 'notificaciones'>('resumen');
  const [studentPayments, setStudentPayments] = useState<StudentPayment[]>([]);
  const [studentNotifs, setStudentNotifs] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [hasUpcomingBookings, setHasUpcomingBookings] = useState(false);

  async function loadCustomers() {
    try {
      const [custRes, servRes] = await Promise.all([
        fetch('/api/customers', { cache: 'no-store' }),
        fetch('/api/services', { cache: 'no-store' }),
      ]);
      if (!custRes.ok) throw new Error('No fue posible cargar los alumnos.');
      const data = await custRes.json() as { customers: Customer[]; visits: Visit[]; stats: typeof stats };
      setCustomers(data.customers);
      setVisits(data.visits);
      if (data.stats) setStats(data.stats);
      if (servRes.ok) {
        const servData = await servRes.json() as { services: Service[] };
        setServices((servData.services || []).filter(s => Boolean(s.active)));
      }
      if (selected) {
        const fresh = data.customers.find(c => c.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (e) {
      demo(e instanceof Error ? e.message : 'No fue posible cargar los alumnos.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenNewStudent() {
    setEditing(null);
    setError('');
    if (services.length > 0) {
      const first = services[0];
      setSelectedServiceId(String(first.id));
      setPlanNameInput(`Plan ${first.name}`);
      setMonthlyFeeInput(first.price_clp);
    } else {
      setSelectedServiceId('custom');
      setPlanNameInput('Mensualidad Regular');
      setMonthlyFeeInput(45000);
    }
    setShowNew(true);
  }

  function handleOpenEditStudent(c: Customer) {
    setEditing(c);
    setError('');
    const matched = services.find(s => s.name === c.plan_name || `Plan ${s.name}` === c.plan_name);
    if (matched) {
      setSelectedServiceId(String(matched.id));
    } else {
      setSelectedServiceId(c.plan_name ? 'custom' : (services[0] ? String(services[0].id) : 'custom'));
    }
    setPlanNameInput(c.plan_name ?? 'Mensualidad Regular');
    setMonthlyFeeInput(c.monthly_fee ?? 45000);
    setShowNew(true);
  }

  function handleServiceChange(serviceIdVal: string) {
    setSelectedServiceId(serviceIdVal);
    if (serviceIdVal === 'custom') {
      if (!planNameInput || planNameInput.startsWith('Plan ')) {
        setPlanNameInput('Plan Personalizado');
      }
      return;
    }
    const s = services.find(serv => String(serv.id) === serviceIdVal);
    if (s) {
      setPlanNameInput(`Plan ${s.name}`);
      setMonthlyFeeInput(s.price_clp);
    }
  }

  useEffect(() => { void loadCustomers(); }, []);

  async function loadStudentDetails(studentId: number) {
    try {
      const [payRes, notifRes] = await Promise.all([
        fetch(`/api/payments?customerId=${studentId}`, { cache: 'no-store' }),
        fetch(`/api/notifications?customerId=${studentId}`, { cache: 'no-store' }),
      ]);
      if (payRes.ok) {
        const d = await payRes.json() as { payments: StudentPayment[] };
        setStudentPayments(d.payments || []);
      }
      if (notifRes.ok) {
        const d = await notifRes.json() as { notifications: StudentNotification[] };
        setStudentNotifs(d.notifications || []);
      }
    } catch {
      // Ignore background fetch error
    }
  }

  function handleSelectStudent(c: Customer) {
    setSelected(c);
    setDrawerTab('resumen');
    void loadStudentDetails(c.id);
  }

  const filtered = customers.filter(c => {
    const matchQuery = `${c.name} ${c.email} ${c.phone ?? ''} ${c.plan_name ?? ''}`.toLowerCase().includes(query.toLowerCase());
    const matchStatus = statusFilter === 'todos' || c.membership_status === statusFilter;
    return matchQuery && matchStatus;
  });

  function initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  function formatDate(value: number | null) {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value * 1000));
  }

  function statusLabel(status: string) {
    switch (status) {
      case 'active': return { label: 'Al día', cls: 'active' };
      case 'pending': return { label: 'Por vencer', cls: 'pending' };
      case 'overdue': return { label: 'Vencida', cls: 'overdue' };
      case 'inactive': return { label: 'Dado de baja', cls: 'inactive' };
      default: return { label: 'Inactivo', cls: 'inactive' };
    }
  }

  async function toggleStatus(student: Customer) {
    const isInactive = student.membership_status === 'inactive';
    const nextStatus = isInactive ? 'active' : 'inactive';
    try {
      const response = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, membershipStatus: nextStatus }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo cambiar el estado del alumno.');
      await loadCustomers();
      demo(result.message ?? (nextStatus === 'inactive' ? `${student.name} dado de baja.` : `${student.name} reactivado.`));
    } catch (e) {
      demo(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    }
  }

  async function executeDelete(id: number, force = false) {
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/customers?id=${id}${force ? '&force=1' : ''}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string; message?: string; hasUpcoming?: boolean };
      if (!response.ok) {
        if (result.hasUpcoming) {
          setHasUpcomingBookings(true);
        }
        throw new Error(result.error ?? 'No se pudo eliminar al alumno.');
      }
      await loadCustomers();
      if (selected?.id === id) setSelected(null);
      setConfirmDelete(null);
      setHasUpcomingBookings(false);
      demo(result.message ?? 'Alumno eliminado.');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar al alumno.');
    } finally {
      setDeleting(false);
    }
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.notifyWhatsapp = form.get('notifyWhatsapp') ? 'true' : 'false';
    payload.notifyEmail = form.get('notifyEmail') ? 'true' : 'false';
    if (editing) payload.id = String(editing.id);

    try {
      const response = await fetch('/api/customers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el alumno.');
      await loadCustomers();
      setShowNew(false);
      setEditing(null);
      demo(result.message ?? 'Alumno guardado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el alumno.');
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingStudent) return;
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.customerId = String(payingStudent.id);

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string; receiptMessage?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar el pago.');
      await loadCustomers();
      if (selected?.id === payingStudent.id) {
        void loadStudentDetails(payingStudent.id);
      }
      setPayingStudent(null);
      demo(result.message ?? 'Pago registrado correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  async function sendNotification(student: Customer, type: 'payment_due' | 'class_reminder' | 'custom', customText = '') {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: student.id, type, message: customText }),
      });
      const data = await response.json() as { error?: string; message?: string; notification?: { whatsappUrl?: string } };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo enviar la notificación.');
      
      demo('✓ Notificación generada y registrada');
      if (data.notification?.whatsappUrl && confirm('¿Deseas abrir WhatsApp ahora para enviar el mensaje directamente al alumno?')) {
        window.open(data.notification.whatsappUrl, '_blank');
      }
      if (selected?.id === student.id) {
        void loadStudentDetails(student.id);
      }
      setNotifyingStudent(null);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al enviar notificación');
    }
  }

  const customerVisits = selected ? visits.filter(v => v.customer_id === selected.id) : [];

  return (
    <div className="clients-content">
      <div className="clients-titlebar">
        <div>
          <p className="eyebrow">CONTROL DE ALUMNOS Y MENSUALIDADES</p>
          <h1>Alumnos</h1>
          <p>Gestiona los cupos, mensualidades, vencimientos y avisos por WhatsApp de tus alumnos.</p>
        </div>
        <button className="primary" onClick={handleOpenNewStudent}>
          <span>＋</span> Nuevo alumno
        </button>
      </div>

      <div className="client-stats" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <article><span className="purple">♙</span><div><small>Total Alumnos</small><strong>{stats.total}</strong></div></article>
        <article><span className="mint">✓</span><div><small>Al día</small><strong style={{ color: '#1c7a5f' }}>{stats.active}</strong></div></article>
        <article><span className="gold">◷</span><div><small>Por vencer</small><strong style={{ color: '#a06c13' }}>{stats.pending}</strong></div></article>
        <article><span className="coral">!</span><div><small>Vencidos / Morosos</small><strong style={{ color: '#be2626' }}>{stats.overdue}</strong></div></article>
        <article><span style={{ color: '#475569', background: '#f1f5f9' }}>⏸</span><div><small>Dados de baja</small><strong style={{ color: '#64748b' }}>{stats.inactive ?? 0}</strong></div></article>
        <article><span className="gold">$</span><div><small>Ingreso Mensual</small><strong>${Number(stats.monthlyRevenue).toLocaleString('es-CL')}</strong></div></article>
      </div>

      <section className="clients-panel">
        <div className="clients-toolbar">
          <div className="client-search">
            ⌕<input aria-label="Buscar alumnos" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar alumno por nombre, teléfono, plan..." />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Filtro:</span>
            {(['todos', 'active', 'pending', 'overdue', 'inactive'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  border: statusFilter === st ? '1px solid #27272a' : '1px solid #e4e4e7',
                  background: statusFilter === st ? '#27272a' : '#ffffff',
                  color: statusFilter === st ? '#ffffff' : '#52525b',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {st === 'todos' ? 'Todos' : st === 'active' ? 'Al día' : st === 'pending' ? 'Por vencer' : st === 'overdue' ? 'Vencidos' : 'Dados de baja'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="clients-empty-container">
            <p style={{ margin: 0, color: '#64748b', fontSize: '15px' }}>Cargando alumnos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="clients-empty-container">
            <div className="clients-empty-card">
              <span className="empty-icon">♙</span>
              <strong>No encontramos alumnos</strong>
              <p>
                {query || statusFilter !== 'todos'
                  ? 'No hay alumnos que coincidan con la búsqueda o el filtro seleccionado.'
                  : 'Aún no tienes alumnos registrados en tu centro.'}
              </p>
              {query || statusFilter !== 'todos' ? (
                <button
                  type="button"
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                  onClick={() => { setQuery(''); setStatusFilter('todos'); }}
                >
                  Limpiar filtros
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
                  onClick={handleOpenNewStudent}
                >
                  <span>＋</span> Registrar primer alumno
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="clients-table-wrap">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Plan & Mensualidad</th>
                  <th>Estado Cuota</th>
                  <th>Próximo Vencimiento</th>
                  <th>Contacto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, index) => {
                const badge = statusLabel(c.membership_status);
                return (
                  <tr key={c.id} onClick={() => handleSelectStudent(c)}>
                    <td>
                      <div className={`customer-avatar tone-${index % 4}`}>{initials(c.name)}</div>
                      <div>
                        <strong>{c.name}</strong>
                        <small>{c.phone || 'Sin WhatsApp'}</small>
                      </div>
                    </td>
                    <td>
                      <strong>{c.plan_name || 'Plan Regular'}</strong>
                      <small>${Number(c.monthly_fee).toLocaleString('es-CL')} / mes</small>
                    </td>
                    <td>
                      <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td>
                      <strong>{formatDate(c.next_payment_due)}</strong>
                      <small>Día {c.payment_due_day || 5} de cada mes</small>
                    </td>
                    <td>
                      <strong>{c.email}</strong>
                      <small>{c.notify_whatsapp ? '🟢 WhatsApp activo' : '⚪ Sin avisos'}</small>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <button
                          className="btn-record-pay"
                          title="Registrar pago de mensualidad"
                          onClick={() => setPayingStudent(c)}
                        >
                          💳 Pagar
                        </button>
                        <button
                          className="btn-notify-wa"
                          title="Enviar aviso por WhatsApp"
                          onClick={() => { setNotifyingStudent(c); setNotifType(c.membership_status === 'overdue' || c.membership_status === 'pending' ? 'payment_due' : 'class_reminder'); }}
                        >
                          💬 Avisar
                        </button>
                        <button
                          className="action-btn-icon"
                          title="Editar ficha del alumno"
                          onClick={() => handleOpenEditStudent(c)}
                        >
                          ✏️
                        </button>
                        <button
                          className="action-btn-icon"
                          title={c.membership_status === 'inactive' ? 'Reactivar alumno' : 'Dar de baja alumno'}
                          style={c.membership_status === 'inactive' ? { color: '#6ee7b7' } : {}}
                          onClick={() => void toggleStatus(c)}
                        >
                          {c.membership_status === 'inactive' ? '▶️' : '⏸️'}
                        </button>
                        <button
                          className="action-btn-icon delete"
                          title="Eliminar alumno"
                          onClick={() => { setConfirmDelete(c); setDeleteError(''); }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>

      {/* Drawer: Ficha detallada del Alumno */}
      {selected && (
        <div className="client-drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="client-drawer" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelected(null)}>×</button>
            <div className="drawer-profile">
              <span>{initials(selected.name)}</span>
              <h2>{selected.name}</h2>
              <p>
                <span className={`status-badge ${statusLabel(selected.membership_status).cls}`}>
                  {statusLabel(selected.membership_status).label}
                </span>
              </p>
            </div>

            <div className="drawer-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              <button
                onClick={() => setPayingStudent(selected)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                  padding: '8px 2px',
                  fontSize: '12px',
                  height: '40px',
                }}
              >
                💳 Pago
              </button>
              <button
                onClick={() => { setNotifyingStudent(selected); setNotifType('payment_due'); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                  padding: '8px 2px',
                  fontSize: '12px',
                  height: '40px',
                }}
              >
                💬 Avisar
              </button>
              <button
                onClick={() => void toggleStatus(selected)}
                style={{
                  background: '#ffffff',
                  color: selected.membership_status === 'inactive' ? '#059669' : '#334155',
                  border: '1px solid var(--line)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '9px',
                  padding: '8px 2px',
                  height: '40px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {selected.membership_status === 'inactive' ? '▶️ Activar' : '⏸️ Baja'}
              </button>
              <button
                onClick={() => { setConfirmDelete(selected); setDeleteError(''); }}
                style={{
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid var(--line)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '9px',
                  padding: '8px 2px',
                  height: '40px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                🗑️ Eliminar
              </button>
            </div>

            <div className="drawer-stat-banner">
              <div className="drawer-stat-box">
                <small>Plan actual</small>
                <strong>{selected.plan_name || 'Regular'}</strong>
              </div>
              <div className="drawer-stat-box">
                <small>Cuota mensual</small>
                <strong style={{ color: '#18875e' }}>${Number(selected.monthly_fee).toLocaleString('es-CL')}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', margin: '15px 0 12px' }}>
              {(['resumen', 'pagos', 'clases', 'notificaciones'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDrawerTab(tab)}
                  style={{
                    border: 0,
                    background: 'none',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: drawerTab === tab ? '#18181b' : '#71717a',
                    borderBottom: drawerTab === tab ? '2px solid #18181b' : '2px solid transparent',
                  }}
                >
                  {tab === 'resumen' ? 'Ficha' : tab === 'pagos' ? `Pagos (${studentPayments.length})` : tab === 'clases' ? `Clases (${customerVisits.length})` : `Avisos (${studentNotifs.length})`}
                </button>
              ))}
            </div>

            {drawerTab === 'resumen' && (
              <dl className="customer-data">
                <div><dt>Próximo vencimiento</dt><dd>{formatDate(selected.next_payment_due)} (día {selected.payment_due_day || 5} del mes)</dd></div>
                <div><dt>Último pago registrado</dt><dd>{formatDate(selected.last_payment_date)}</dd></div>
                <div><dt>WhatsApp / Teléfono</dt><dd>{selected.phone || 'No registrado'}</dd></div>
                <div><dt>Correo electrónico</dt><dd>{selected.email}</dd></div>
                <div><dt>Notas del instructor</dt><dd>{selected.notes || 'Sin notas.'}</dd></div>
                <div style={{ textAlign: 'center', paddingTop: '14px' }}>
                  <button style={{ border: 0, background: 'none', color: '#18181b', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleOpenEditStudent(selected)}>✎ Editar datos del alumno</button>
                </div>
              </dl>
            )}

            {drawerTab === 'pagos' && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {studentPayments.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', padding: '20px' }}>No hay pagos registrados para este alumno.</p>
                ) : studentPayments.map(p => (
                  <div className="payment-history-item" key={p.id}>
                    <div>💳</div>
                    <div>
                      <strong>Período: {p.period}</strong>
                      <small>{formatDate(p.payment_date)} · {p.payment_method}</small>
                    </div>
                    <div className="pay-amount">${p.amount.toLocaleString('es-CL')}</div>
                  </div>
                ))}
              </div>
            )}

            {drawerTab === 'clases' && (
              <div className="visit-history">
                {customerVisits.length === 0 ? (
                  <p>Este alumno no tiene clases registradas aún.</p>
                ) : customerVisits.map(v => (
                  <article key={v.id}>
                    <i className={v.status === 'completed' ? 'done' : 'upcoming'} />
                    <div>
                      <strong>{v.service_name}</strong>
                      <small>{new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v.starts_at * 1000))} · con {v.professional_name}</small>
                    </div>
                    <span className={v.payment_status === 'paid' ? 'paid' : 'pending'}>{v.payment_status === 'paid' ? 'Incluido' : 'Pendiente'}</span>
                  </article>
                ))}
              </div>
            )}

            {drawerTab === 'notificaciones' && (
              <div>
                {studentNotifs.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', padding: '20px' }}>No se han enviado avisos aún.</p>
                ) : studentNotifs.map(n => (
                  <div className="notification-history-item" key={n.id}>
                    <div className="notif-top">
                      <span>{n.type === 'payment_due' ? 'Vencimiento' : n.type === 'class_reminder' ? 'Próxima Clase' : 'Aviso'} via {n.channel}</span>
                      <span>{formatDate(n.sent_at)}</span>
                    </div>
                    <div className="notif-body">{n.message}</div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Modal: Registrar Pago de Mensualidad */}
      {payingStudent && (
        <div className="modal-backdrop">
          <form className="new-booking-modal" onSubmit={submitPayment}>
            <button type="button" className="close-modal" onClick={() => setPayingStudent(null)}>×</button>
            <p className="eyebrow">COBRO DE MENSUALIDAD</p>
            <h2>Registrar Pago para {payingStudent.name}</h2>
            <p>Al registrar el pago, la mensualidad pasará automáticamente a estado <strong>Al día 🟢</strong> y se generará el recibo.</p>
            <div className="form-grid">
              <label>Monto pagado (CLP)
                <input name="amount" type="number" required defaultValue={payingStudent.monthly_fee || 35000} step="1000" />
              </label>
              <label>Período cubierto
                <input name="period" required defaultValue={new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date())} placeholder="Ej: Octubre 2026" />
              </label>
              <label>Método de pago
                <select name="paymentMethod" defaultValue="transfer">
                  <option value="transfer">Transferencia bancaria</option>
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta de débito/crédito</option>
                  <option value="other">Otro medio</option>
                </select>
              </label>
              <label>Fecha de pago
                <input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </label>
              <label className="full">Notas del comprobante
                <textarea name="notes" rows={2} placeholder="Nº de comprobante de transferencia o detalle adicional (opcional)" />
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setPayingStudent(null)}>Cancelar</button>
              <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar Pago Recibido'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Enviar Notificación / WhatsApp */}
      {notifyingStudent && (
        <div className="modal-backdrop">
          <div className="new-booking-modal" style={{ maxWidth: '500px' }}>
            <button type="button" className="close-modal" onClick={() => setNotifyingStudent(null)}>×</button>
            <p className="eyebrow">ENVIAR AVISO AL ALUMNO</p>
            <h2>Notificar a {notifyingStudent.name}</h2>
            <p>Selecciona el tipo de aviso para generar el mensaje por WhatsApp o correo.</p>
            <div style={{ display: 'grid', gap: '10px', margin: '14px 0' }}>
              <label>Tipo de aviso:
                <select
                  value={notifType}
                  onChange={e => setNotifType(e.target.value as any)}
                  style={{ width: '100%', marginTop: '5px', padding: '8px', borderRadius: '7px', border: '1px solid #ddd' }}
                >
                  <option value="payment_due">Recordatorio de vencimiento de mensualidad</option>
                  <option value="class_reminder">Recordatorio de próxima clase</option>
                  <option value="custom">Mensaje personalizado</option>
                </select>
              </label>
              {notifType === 'custom' && (
                <label>Mensaje:
                  <textarea
                    rows={4}
                    value={notifMessage}
                    onChange={e => setNotifMessage(e.target.value)}
                    placeholder="Escribe el mensaje aquí..."
                    style={{ width: '100%', marginTop: '5px', padding: '8px', borderRadius: '7px', border: '1px solid #ddd' }}
                  />
                </label>
              )}
            </div>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '9px', padding: '12px 14px', fontSize: '13px', color: '#047857', marginBottom: '16px' }}>
              ℹ Se enviará o abrirá un mensaje de WhatsApp al número <strong>{notifyingStudent.phone || '(sin teléfono registrado, se usará email)'}</strong>.
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setNotifyingStudent(null)}>Cancelar</button>
              <button
                type="button"
                className="primary"
                onClick={() => void sendNotification(notifyingStudent, notifType, notifMessage)}
              >
                Enviar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear / Editar Alumno */}
      {showNew && (
        <div className="modal-backdrop">
          <form className="new-booking-modal customer-form" onSubmit={submitCustomer}>
            <button type="button" className="close-modal" onClick={() => { setShowNew(false); setEditing(null); setError(''); }}>×</button>
            <p className="eyebrow">{editing ? 'EDITAR ALUMNO' : 'NUEVO ALUMNO'}</p>
            <h2>{editing ? 'Actualizar ficha de alumno' : 'Registrar nuevo alumno'}</h2>
            <p>Configura los datos del alumno y las condiciones de su mensualidad.</p>
            <div className="form-grid">
              <label className="full">Nombre completo
                <input name="name" required defaultValue={editing?.name ?? ''} placeholder="Ej: Valentina Morales" />
              </label>
              <div
                className="full"
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '14px 16px',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  margin: '2px 0 8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Avisos y recordatorios automáticos
                  </span>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Canales de contacto y notificación</small>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Correo electrónico
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={editing?.email ?? ''}
                      placeholder="alumno@correo.cl"
                      style={{ height: '42px', width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: '#0f172a' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Teléfono (WhatsApp)
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={editing?.phone ?? ''}
                      placeholder="+56 9 1234 5678"
                      style={{ height: '42px', width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: '#0f172a' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: '#0f172a',
                      fontWeight: 600,
                      userSelect: 'none',
                      margin: 0,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '9px 12px',
                    }}
                  >
                    <input
                      name="notifyEmail"
                      type="checkbox"
                      style={{ width: '18px', height: '18px', margin: 0, padding: 0, accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                      defaultChecked={editing ? Boolean(editing.notify_email) : true}
                    />
                    <span>Enviar avisos por Email</span>
                  </label>
                 <label
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: '#0f172a',
                      fontWeight: 600,
                      userSelect: 'none',
                      margin: 0,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '9px 12px',
                    }}
                  >
                    <input
                      name="notifyWhatsapp"
                      type="checkbox"
                      style={{ width: '18px', height: '18px', margin: 0, padding: 0, accentColor: '#16a34a', cursor: 'pointer', flexShrink: 0 }}
                      defaultChecked={editing ? Boolean(editing.notify_whatsapp) : true}
                    />
                    <span>Enviar avisos por WhatsApp</span>
                  </label>
                </div>
              </div>

              <label className="full">Clase o Servicio asignado
                <select
                  value={selectedServiceId}
                  onChange={e => handleServiceChange(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  {services.length === 0 ? (
                    <option value="custom">Sin clases creadas aún (Tarifa manual)</option>
                  ) : (
                    <>
                      <option value="" disabled>-- Selecciona la clase o disciplina --</option>
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.class_type === 'grupal' ? `👥 Grupal (Cap: ${s.capacity || 10})` : '👤 Individual'} {s.schedule ? `· 🕒 ${s.schedule}` : ''} · ${Number(s.price_clp).toLocaleString('es-CL')} / mes
                        </option>
                      ))}
                      <option value="custom">⚙️ Otro plan / Tarifa personalizada...</option>
                    </>
                  )}
                </select>
              </label>
              <label>Plan de mensualidad
                <input
                  name="planName"
                  value={planNameInput}
                  onChange={e => setPlanNameInput(e.target.value)}
                  placeholder="Ej: Plan Karate, Pase Libre"
                  required
                />
              </label>
              <label>Valor mensual (CLP)
                <input
                  name="monthlyFee"
                  type="number"
                  min="0"
                  step="1000"
                  value={monthlyFeeInput}
                  onChange={e => setMonthlyFeeInput(e.target.value)}
                  placeholder="45000"
                  required
                />
              </label>
              <label>Día de vencimiento (1 al 31)
                <input name="paymentDueDay" type="number" min="1" max="31" defaultValue={editing?.payment_due_day ?? 5} placeholder="5" />
              </label>
              {editing && (
                <label>Estado de mensualidad
                  <select name="membershipStatus" defaultValue={editing.membership_status}>
                    <option value="active">Al día 🟢</option>
                    <option value="pending">Por vencer 🟡</option>
                    <option value="overdue">Vencida 🔴</option>
                    <option value="inactive">Dado de baja ⚪ (Membresía pausada)</option>
                  </select>
                </label>
              )}
              <label className="full">Notas del instructor
                <textarea name="notes" rows={3} defaultValue={editing?.notes ?? ''} placeholder="Nivel del alumno, lesiones, metas u observaciones relevantes" />
              </label>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {editing ? (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => {
                    const toDelete = editing;
                    setShowNew(false);
                    setEditing(null);
                    setConfirmDelete(toDelete);
                    setDeleteError('');
                  }}
                >
                  🗑️ Eliminar alumno
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setShowNew(false); setEditing(null); }}>Cancelar</button>
                <button type="submit" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar alumno'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Confirmar Eliminación de Alumno */}
      {confirmDelete && (
        <div className="modal-backdrop">
          <div className="new-booking-modal" style={{ maxWidth: '490px' }}>
            <button
              type="button"
              className="close-modal"
              onClick={() => {
                setConfirmDelete(null);
                setDeleteError('');
              }}
            >
              ×
            </button>
            <p className="eyebrow" style={{ color: '#ef4444' }}>CONFIRMAR ACCIÓN</p>
            <h2 style={{ color: '#0f172a', margin: '0 0 8px' }}>¿Eliminar al alumno &quot;{confirmDelete.name}&quot;?</h2>
            <p style={{ color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente al alumno, sus asistencias y registros de pagos asociados.
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px',
                margin: '14px 0',
                color: '#475569',
                fontSize: '13px',
              }}
            >
              <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                💡 ¿Prefieres &quot;Dar de baja&quot;?
              </strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Al dar de baja, se pausa su mensualidad y ya no ocupará cupos en clases, pero se conservará todo su historial de pagos y clases pasadas.
              </span>
            </div>

            {deleteError && (
              <div style={{ marginBottom: '14px' }}>
                <div className="form-error" role="alert" style={{ marginBottom: '10px' }}>
                  {deleteError}
                </div>
                {hasUpcomingBookings && (
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #f87171',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    disabled={deleting}
                    onClick={() => void executeDelete(confirmDelete.id, true)}
                  >
                    ⚠️ {deleting ? 'Eliminando con reservas…' : 'Eliminar de todas formas (cancelando reservas)'}
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {confirmDelete.membership_status !== 'inactive' && (
                <button
                  type="button"
                  style={{
                    background: '#f1f5f9',
                    color: '#0f172a',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  onClick={async () => {
                    await toggleStatus(confirmDelete);
                    setConfirmDelete(null);
                  }}
                >
                  ⏸️ Dar de baja en lugar de eliminar
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(null);
                    setDeleteError('');
                  }}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  disabled={deleting}
                  onClick={() => void executeDelete(confirmDelete.id)}
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar alumno'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsModule({ demo }: { demo: (message: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'alumnos_pendientes' | 'reservas_pendientes' | 'historial' | 'todos'>('alumnos_pendientes');
  const [payingStudent, setPayingStudent] = useState<Customer | null>(null);
  const [paymentType, setPaymentType] = useState<'full' | 'abono'>('full');
  const [payingAmount, setPayingAmount] = useState<number | string>(35000);
  const [payingPeriod, setPayingPeriod] = useState<string>('');
  const [payingMethod, setPayingMethod] = useState<string>('transfer');
  const [payingNotes, setPayingNotes] = useState<string>('');
  const [abonoNewDueDate, setAbonoNewDueDate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [receiptNotice, setReceiptNotice] = useState<{
    studentName: string;
    amount: number;
    period: string;
    whatsappUrl?: string | null;
    isAbono?: boolean;
    remainingBalance?: number;
  } | null>(null);

  // Manual Debtor Modal state
  const [debtorModalOpen, setDebtorModalOpen] = useState(false);
  const [debtorMode, setDebtorMode] = useState<'new' | 'existing'>('new');
  const [debtorSelectedId, setDebtorSelectedId] = useState<number | ''>('');
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [debtorEmail, setDebtorEmail] = useState('');
  const [debtorConcept, setDebtorConcept] = useState('Mensualidad');
  const [debtorAmount, setDebtorAmount] = useState<number | string>(35000);
  const [debtorDueDate, setDebtorDueDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [debtorStatus, setDebtorStatus] = useState<'overdue' | 'pending'>('overdue');
  const [debtorNotes, setDebtorNotes] = useState('');
  const [savingDebtor, setSavingDebtor] = useState(false);
  const [debtorError, setDebtorError] = useState('');

  const currentMonthStr = useMemo(() => {
    return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date());
  }, []);

  async function loadData(showNotice = false) {
    try {
      if (showNotice) setRefreshing(true);
      const [custRes, bookRes, payRes] = await Promise.all([
        fetch('/api/customers', { cache: 'no-store' }),
        fetch('/api/bookings?includeCancelled=0', { cache: 'no-store' }),
        fetch('/api/payments', { cache: 'no-store' }),
      ]);
      if (custRes.ok) {
        const d = (await custRes.json()) as { customers: Customer[] };
        setCustomers(d.customers || []);
      }
      if (bookRes.ok) {
        const d = (await bookRes.json()) as { bookings: BookingRow[] };
        setBookings(d.bookings || []);
      }
      if (payRes.ok) {
        const d = (await payRes.json()) as { payments: StudentPayment[] };
        setPayments(d.payments || []);
      }
      if (showNotice) demo('Datos de pagos actualizados.');
    } catch {
      demo('No fue posible cargar los datos de pagos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  }

  function cleanPhone(p: string | null | undefined): string {
    if (!p) return '';
    let cleaned = p.replace(/[^\d]/g, '');
    if (cleaned.length === 9 && cleaned.startsWith('9')) {
      cleaned = '56' + cleaned;
    }
    return cleaned;
  }

  function formatDate(seconds: number | null | undefined): string {
    if (!seconds) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(seconds * 1000));
  }

  // Pending / Overdue Students
  const pendingStudents = customers.filter(
    (c) => c.membership_status === 'overdue' || c.membership_status === 'pending'
  );
  const overdueStudents = customers.filter((c) => c.membership_status === 'overdue');
  const totalPendingStudentFees = pendingStudents.reduce((acc, c) => acc + (c.monthly_fee || 0), 0);

  // Unpaid Bookings
  const unpaidBookings = bookings.filter(
    (b) => b.payment_status === 'unpaid' || b.payment_status === 'partial'
  );
  const totalUnpaidBookings = unpaidBookings.reduce((acc, b) => acc + (b.amount_clp || 0), 0);

  // Total Pending
  const totalPendingAll = totalPendingStudentFees + totalUnpaidBookings;

  // Monthly Revenue
  const now = new Date();
  const curM = now.getMonth();
  const curY = now.getFullYear();
  const monthPayments = payments.filter((p) => {
    const d = new Date(p.payment_date * 1000);
    return d.getMonth() === curM && d.getFullYear() === curY;
  });
  const totalRevenueMonth = monthPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

  // Search filtering
  const q = query.trim().toLowerCase();

  const filteredPendingStudents = pendingStudents.filter((c) =>
    !q || `${c.name} ${c.email} ${c.phone ?? ''} ${c.plan_name ?? ''}`.toLowerCase().includes(q)
  );

  const filteredUnpaidBookings = unpaidBookings.filter((b) =>
    !q || `${b.customer_name} ${b.customer_email} ${b.customer_phone ?? ''} ${b.service_name} ${b.professional_name}`.toLowerCase().includes(q)
  );

  const filteredPayments = payments.filter((p) => {
    const cust = customers.find((c) => c.id === p.customer_id);
    const searchString = `${cust?.name ?? ''} ${cust?.phone ?? ''} ${p.period} ${p.payment_method} ${p.notes ?? ''}`.toLowerCase();
    return !q || searchString.includes(q);
  });

  const filteredAllStudents = customers.filter((c) =>
    !q || `${c.name} ${c.email} ${c.phone ?? ''} ${c.plan_name ?? ''}`.toLowerCase().includes(q)
  );

  function handleOpenAddDebtorModal(prefillStudent?: Customer) {
    if (prefillStudent) {
      setDebtorMode('existing');
      setDebtorSelectedId(prefillStudent.id);
      setDebtorName(prefillStudent.name);
      setDebtorPhone(prefillStudent.phone || '');
      setDebtorEmail(prefillStudent.email.includes('@sin-correo.local') ? '' : prefillStudent.email);
      setDebtorConcept(prefillStudent.plan_name || 'Cuota Pendiente');
      setDebtorAmount(prefillStudent.monthly_fee || 35000);
      if (prefillStudent.next_payment_due) {
        const d = new Date(prefillStudent.next_payment_due * 1000);
        setDebtorDueDate(d.toISOString().split('T')[0]);
      } else {
        const d = new Date();
        setDebtorDueDate(d.toISOString().split('T')[0]);
      }
      setDebtorStatus(prefillStudent.membership_status === 'pending' ? 'pending' : 'overdue');
      setDebtorNotes(prefillStudent.notes || '');
    } else {
      setDebtorMode('new');
      setDebtorSelectedId('');
      setDebtorName('');
      setDebtorPhone('');
      setDebtorEmail('');
      setDebtorConcept('Mensualidad');
      setDebtorAmount(35000);
      const d = new Date();
      setDebtorDueDate(d.toISOString().split('T')[0]);
      setDebtorStatus('overdue');
      setDebtorNotes('');
    }
    setDebtorError('');
    setDebtorModalOpen(true);
  }

  function handleSelectExistingStudent(studentIdStr: string) {
    const id = Number(studentIdStr);
    setDebtorSelectedId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setDebtorName(found.name);
      setDebtorPhone(found.phone || '');
      setDebtorEmail(found.email.includes('@sin-correo.local') ? '' : found.email);
      setDebtorConcept(found.plan_name || 'Mensualidad');
      setDebtorAmount(found.monthly_fee || 35000);
      if (found.next_payment_due) {
        const d = new Date(found.next_payment_due * 1000);
        setDebtorDueDate(d.toISOString().split('T')[0]);
      }
      setDebtorNotes(found.notes || '');
    }
  }

  function setDateShortcut(daysOffset: number) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    setDebtorDueDate(d.toISOString().split('T')[0]);
    if (daysOffset <= 0) {
      setDebtorStatus('overdue');
    } else {
      setDebtorStatus('pending');
    }
  }

  async function handleSaveDebtor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingDebtor(true);
    setDebtorError('');

    try {
      const amountNum = Number(debtorAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Ingresa un monto de deuda válido.');
      }

      const [y, m, d] = debtorDueDate.split('-').map(Number);
      const dueDateObj = new Date(y, m - 1, d, 23, 59, 59);
      const dueTimestamp = Math.floor(dueDateObj.getTime() / 1000);
      const dueDay = d || 5;

      if (debtorMode === 'existing') {
        if (!debtorSelectedId) {
          throw new Error('Selecciona un alumno existente de la lista.');
        }
        const res = await fetch('/api/customers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: debtorSelectedId,
            name: debtorName.trim(),
            phone: debtorPhone.trim() || null,
            email: debtorEmail.trim() || undefined,
            planName: debtorConcept.trim() || 'Cuota Pendiente',
            monthlyFee: amountNum,
            paymentDueDay: dueDay,
            membershipStatus: debtorStatus,
            nextPaymentDue: dueTimestamp,
            notes: debtorNotes.trim() || null,
          }),
        });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la deuda del alumno.');

        demo(`✓ Alumno ${debtorName} registrado como deudor ($${amountNum.toLocaleString('es-CL')}).`);
      } else {
        if (!debtorName.trim()) {
          throw new Error('El nombre del deudor es obligatorio.');
        }
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: debtorName.trim(),
            phone: debtorPhone.trim() || null,
            email: debtorEmail.trim() || undefined,
            planName: debtorConcept.trim() || 'Cuota Pendiente',
            monthlyFee: amountNum,
            paymentDueDay: dueDay,
            membershipStatus: debtorStatus,
            nextPaymentDue: dueTimestamp,
            notes: debtorNotes.trim() || null,
          }),
        });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar el nuevo deudor.');

        demo(`✓ Deudor ${debtorName.trim()} ingresado correctamente ($${amountNum.toLocaleString('es-CL')}).`);
      }

      setDebtorModalOpen(false);
      await loadData();
      setActiveTab('alumnos_pendientes');
    } catch (err) {
      setDebtorError(err instanceof Error ? err.message : 'Error al guardar deudor.');
    } finally {
      setSavingDebtor(false);
    }
  }

  function handleOpenPayStudent(c: Customer, mode: 'full' | 'abono' = 'full') {
    setPayingStudent(c);
    setPaymentType(mode);
    if (mode === 'abono') {
      const half = Math.round(Number(c.monthly_fee || 35000) / 2);
      setPayingAmount(half > 0 ? half : 15000);
    } else {
      setPayingAmount(c.monthly_fee || 35000);
    }
    setPayingPeriod(currentMonthStr.charAt(0).toUpperCase() + currentMonthStr.slice(1));
    setPayingMethod('transfer');
    setPayingNotes('');
    setAbonoNewDueDate('');
    setFormError('');
  }

  async function handleConfirmPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payingStudent) return;
    setSaving(true);
    setFormError('');

    const form = new FormData(e.currentTarget);
    const amount = Number(form.get('amount'));
    const period = String(form.get('period') || currentMonthStr).trim();
    const paymentMethod = String(form.get('paymentMethod') || 'transfer');
    const notes = String(form.get('notes') || '').trim();

    const isAbono = paymentType === 'abono';
    const totalDue = Number(payingStudent.monthly_fee || 0);
    const remainingBalance = Math.max(0, totalDue - amount);

    let newDueTimestamp: number | undefined = undefined;
    if (isAbono && abonoNewDueDate) {
      const [y, m, d] = abonoNewDueDate.split('-').map(Number);
      newDueTimestamp = Math.floor(new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000);
    }

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: payingStudent.id,
          amount,
          period,
          paymentMethod,
          notes,
          isAbono: isAbono && remainingBalance > 0,
          remainingBalance: isAbono ? remainingBalance : 0,
          newDueDate: newDueTimestamp,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago.');

      await loadData();
      if (isAbono && remainingBalance > 0) {
        demo(`✓ Abono de $${amount.toLocaleString('es-CL')} registrado para ${payingStudent.name}. Saldo pendiente: $${remainingBalance.toLocaleString('es-CL')}.`);
      } else {
        demo(`✓ Pago de $${amount.toLocaleString('es-CL')} registrado para ${payingStudent.name}. Alumno al día.`);
      }

      // Prepare WhatsApp receipt link
      const phoneClean = cleanPhone(payingStudent.phone);
      const receiptMsg = isAbono && remainingBalance > 0
        ? `¡Hola ${payingStudent.name}! 🧾 Confirmamos que hemos recibido tu abono de *$${amount.toLocaleString('es-CL')}* correspondiente a *${period}* (${payingStudent.plan_name || 'Plan'}). Te queda un saldo pendiente de *$${remainingBalance.toLocaleString('es-CL')}*. ¡Muchas gracias!`
        : `¡Hola ${payingStudent.name}! 🧾 Confirmamos que hemos recibido tu pago de *$${amount.toLocaleString('es-CL')}* correspondiente a *${period}* (${payingStudent.plan_name || 'Plan'}). Tu membresía se encuentra al día. ¡Muchas gracias!`;
      const waUrl = phoneClean ? `https://wa.me/${phoneClean}?text=${encodeURIComponent(receiptMsg)}` : null;

      setReceiptNotice({
        studentName: payingStudent.name,
        amount,
        period,
        whatsappUrl: waUrl,
        isAbono: isAbono && remainingBalance > 0,
        remainingBalance,
      });

      setPayingStudent(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar pago.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkBookingPaid(booking: BookingRow) {
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: booking.id, paymentStatus: 'paid' }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'No se pudo marcar la reserva como pagada.');

      await loadData();
      demo(`✓ Clase de ${booking.customer_name} marcada como pagada.`);
    } catch (err) {
      demo(err instanceof Error ? err.message : 'Error al actualizar pago de reserva.');
    }
  }

  function handleSendStudentCollection(c: Customer) {
    if (!c.phone) {
      demo(`El alumno ${c.name} no tiene teléfono registrado para WhatsApp.`);
      return;
    }
    const phoneClean = cleanPhone(c.phone);
    const dueDateStr = c.next_payment_due ? formatDate(c.next_payment_due) : `día ${c.payment_due_day || 5} de este mes`;
    const feeStr = Number(c.monthly_fee || 0).toLocaleString('es-CL');
    const msg = `¡Hola ${c.name}! Te saludamos de Espacio de Clases. Te recordamos cordialmente que tu cuota de *${c.plan_name || 'Mensualidad'}* por *$${feeStr}* tiene fecha de vencimiento (*${dueDateStr}*). Si ya transferiste o necesitas los datos de la cuenta, por favor escríbenos. ¡Muchas gracias!`;
    window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function handleSendBookingCollection(b: BookingRow) {
    if (!b.customer_phone) {
      demo(`El alumno ${b.customer_name} no tiene teléfono registrado.`);
      return;
    }
    const phoneClean = cleanPhone(b.customer_phone);
    const bDate = new Date(b.starts_at * 1000);
    const dateFormatted = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(bDate);
    const feeStr = Number(b.amount_clp || 0).toLocaleString('es-CL');
    const msg = `¡Hola ${b.customer_name}! Te recordamos que tienes pendiente el pago de tu clase de *${b.service_name}* del *${dateFormatted}* por un valor de *$${feeStr}*. Por favor confírmanos tu transferencia para dejarla registrada en el sistema. ¡Te esperamos!`;
    window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <div className="services-content">
      {/* Encabezado */}
      <div className="services-titlebar">
        <div>
          <p className="eyebrow">CONTROL FINANCIERO Y COBRANZAS</p>
          <h1>Pagos y Cuotas Pendientes</h1>
          <p>Visualiza qué alumnos tienen cuotas vencidas, reservas impagas y gestiona la cobranza directa.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            style={{
              background: '#18181b',
              border: '1px solid #18181b',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            onClick={() => handleOpenAddDebtorModal()}
          >
            <span>➕</span> Ingresar Deudor Manual
          </button>
          <button
            type="button"
            style={{
              background: '#ffffff',
              border: '1px solid #d4d4d8',
              borderRadius: '8px',
              padding: '8px 14px',
              color: '#27272a',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
            }}
            onClick={() => void loadData(true)}
          >
            <span>↻</span> {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Tarjetas de Estadísticas Financieras */}
      <div className="service-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <article>
          <span className="coral">🔴</span>
          <div>
            <small>Total por Cobrar</small>
            <strong style={{ color: '#b91c1c' }}>${totalPendingAll.toLocaleString('es-CL')}</strong>
          </div>
        </article>
        <article>
          <span className="purple">⚠️</span>
          <div>
            <small>Alumnos con Cuota Vencida</small>
            <strong style={{ color: '#c2410c' }}>{overdueStudents.length}</strong>
          </div>
        </article>
        <article>
          <span className="gold">⏳</span>
          <div>
            <small>Clases / Reservas Impagas</small>
            <strong style={{ color: '#b45309' }}>{unpaidBookings.length}</strong>
          </div>
        </article>
        <article>
          <span className="mint">✓</span>
          <div>
            <small>Recaudado este Mes</small>
            <strong style={{ color: '#047857' }}>${(totalRevenueMonth > 0 ? totalRevenueMonth : (payments.reduce((a, p) => a + (p.amount || 0), 0))).toLocaleString('es-CL')}</strong>
          </div>
        </article>
      </div>

      {/* Pestañas de Navegación del Módulo */}
      <div className="bookings-panel" style={{ marginTop: '20px' }}>
        <div className="bookings-toolbar" style={{ borderBottom: '1px solid #e4e4e7', paddingBottom: '14px' }}>
          <div className="bookings-toolbar-row1">
            <div className="bookings-search">
              <span>⌕</span>
              <input
                aria-label="Buscar cobro"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar alumno, teléfono, plan o clase..."
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`filter-btn-pill ${activeTab === 'alumnos_pendientes' ? 'active' : ''}`}
                onClick={() => setActiveTab('alumnos_pendientes')}
                style={{
                  background: activeTab === 'alumnos_pendientes' ? '#27272a' : '#f4f4f5',
                  color: activeTab === 'alumnos_pendientes' ? '#ffffff' : '#27272a',
                  fontWeight: 600,
                }}
              >
                ⚠️ Alumnos Pendientes ({pendingStudents.length})
              </button>
              <button
                type="button"
                className={`filter-btn-pill ${activeTab === 'reservas_pendientes' ? 'active' : ''}`}
                onClick={() => setActiveTab('reservas_pendientes')}
                style={{
                  background: activeTab === 'reservas_pendientes' ? '#27272a' : '#f4f4f5',
                  color: activeTab === 'reservas_pendientes' ? '#ffffff' : '#27272a',
                  fontWeight: 600,
                }}
              >
                ⏳ Clases por Cobrar ({unpaidBookings.length})
              </button>
              <button
                type="button"
                className={`filter-btn-pill ${activeTab === 'historial' ? 'active' : ''}`}
                onClick={() => setActiveTab('historial')}
                style={{
                  background: activeTab === 'historial' ? '#27272a' : '#f4f4f5',
                  color: activeTab === 'historial' ? '#ffffff' : '#27272a',
                  fontWeight: 600,
                }}
              >
                📜 Historial de Pagos ({payments.length})
              </button>
              <button
                type="button"
                className={`filter-btn-pill ${activeTab === 'todos' ? 'active' : ''}`}
                onClick={() => setActiveTab('todos')}
                style={{
                  background: activeTab === 'todos' ? '#27272a' : '#f4f4f5',
                  color: activeTab === 'todos' ? '#ffffff' : '#27272a',
                  fontWeight: 600,
                }}
              >
                👥 Todos los Alumnos ({customers.length})
              </button>
            </div>
          </div>
        </div>

        {/* CONTENIDO DE PESTAÑAS */}
        <div style={{ padding: '0', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
              Cargando información de pagos…
            </div>
          ) : activeTab === 'alumnos_pendientes' ? (
            filteredPendingStudents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#71717a' }}>
                <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>🎉</span>
                <strong style={{ fontSize: '16px', color: '#18181b', display: 'block' }}>
                  {q ? 'No hay alumnos que coincidan con la búsqueda.' : '¡Excelente! Todos los alumnos están al día.'}
                </strong>
                <p style={{ margin: '6px 0 14px', fontSize: '13px' }}>
                  No tienes alumnos con cuotas vencidas ni por vencer en este momento.
                </p>
                <button
                  type="button"
                  style={{
                    background: '#18181b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={() => handleOpenAddDebtorModal()}
                >
                  <span>➕</span> Ingresar Deudor Manual
                </button>
              </div>
            ) : (
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th>Alumno / Deudor</th>
                    <th>Concepto / Plan</th>
                    <th>Monto Adeudado</th>
                    <th>Fecha de Vencimiento</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acciones de Cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPendingStudents.map((c, idx) => {
                    const isOverdue = c.membership_status === 'overdue';
                    const dueDateStr = c.next_payment_due ? formatDate(c.next_payment_due) : `Día ${c.payment_due_day || 5} de cada mes`;
                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                background: isOverdue ? '#fee2e2' : '#fef3c7',
                                color: isOverdue ? '#b91c1c' : '#b45309',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: '12px',
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {initials(c.name)}
                            </span>
                            <div>
                              <strong>{c.name}</strong>
                              <small style={{ color: '#71717a', display: 'block' }}>
                                {c.phone || (c.email.includes('@sin-correo.local') ? 'Sin correo' : c.email)}
                              </small>
                              {c.notes && (
                                <small style={{ color: '#71717a', display: 'block', marginTop: '2px', fontStyle: 'italic' }}>
                                  📝 {c.notes}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{c.plan_name || 'Plan Mensual'}</strong>
                          <small style={{ display: 'block', color: '#71717a' }}>
                            Vence cada día {c.payment_due_day || 5}
                          </small>
                        </td>
                        <td>
                          <strong style={{ fontSize: '15px', color: isOverdue ? '#b91c1c' : '#18181b' }}>
                            ${Number(c.monthly_fee || 0).toLocaleString('es-CL')}
                          </strong>
                        </td>
                        <td>
                          <div>{dueDateStr}</div>
                          {c.last_payment_date && (
                            <small style={{ color: '#71717a' }}>
                              Último pago: {formatDate(c.last_payment_date)}
                            </small>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontWeight: 700,
                              background: isOverdue ? '#fee2e2' : '#fef3c7',
                              color: isOverdue ? '#b91c1c' : '#b45309',
                              border: isOverdue ? '1px solid #fecaca' : '1px solid #fde68a',
                            }}
                          >
                            {isOverdue ? '🔴 Cuota Vencida' : '🟡 Por Vencer'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              style={{
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                padding: '6px 11px',
                                borderRadius: '7px',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Registrar pago completo y poner al día"
                              onClick={() => handleOpenPayStudent(c, 'full')}
                            >
                              <span>💵</span> Pagar Todo
                            </button>
                            <button
                              type="button"
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                padding: '6px 10px',
                                borderRadius: '7px',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Abonar parte de la deuda"
                              onClick={() => handleOpenPayStudent(c, 'abono')}
                            >
                              <span>💰</span> Abonar
                            </button>
                            <button
                              type="button"
                              style={{
                                background: '#f4f4f5',
                                color: '#27272a',
                                border: '1px solid #d4d4d8',
                                padding: '6px 9px',
                                borderRadius: '7px',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Editar o ajustar deuda"
                              onClick={() => handleOpenAddDebtorModal(c)}
                            >
                              <span>✏️</span> Editar
                            </button>
                            {c.phone && (
                              <button
                                type="button"
                                style={{
                                  background: '#25D366',
                                  color: '#ffffff',
                                  border: 'none',
                                  padding: '6px 10px',
                                  borderRadius: '7px',
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Enviar recordatorio de cobro por WhatsApp"
                                onClick={() => handleSendStudentCollection(c)}
                              >
                                <span>💬</span> Cobrar
                              </button>
                            )}
                            {c.email && !c.email.includes('@sin-correo.local') && (
                              <a
                                href={`mailto:${c.email}?subject=${encodeURIComponent(`Aviso de Pago: ${c.plan_name || 'Mensualidad'}`)}&body=${encodeURIComponent(`Hola ${c.name},\n\nTe recordamos que tu cuota de ${c.plan_name || 'Mensualidad'} por $${Number(c.monthly_fee || 0).toLocaleString('es-CL')} se encuentra pendiente de pago con fecha de vencimiento (${dueDateStr}).\n\nPor favor envíanos tu comprobante de transferencia al realizar el pago.\n\n¡Muchas gracias!\nEspacio de Clases`)}`}
                                style={{
                                  background: '#27272a',
                                  color: '#ffffff',
                                  padding: '6px 10px',
                                  borderRadius: '7px',
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Enviar correo de cobro"
                              >
                                <span>✉️</span> Correo
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : activeTab === 'reservas_pendientes' ? (
            filteredUnpaidBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#71717a' }}>
                <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>✓</span>
                <strong style={{ fontSize: '16px', color: '#18181b', display: 'block' }}>
                  {q ? 'No hay reservas pendientes con ese filtro.' : '¡Todas las clases agendadas están pagadas o al día!'}
                </strong>
                <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                  No se encontraron reservas con estado de pago pendiente.
                </p>
              </div>
            ) : (
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Alumno</th>
                    <th>Clase / Disciplina</th>
                    <th>Instructor</th>
                    <th>Monto Adeudado</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnpaidBookings.map((b) => {
                    const bDate = new Date(b.starts_at * 1000);
                    const formattedDate = new Intl.DateTimeFormat('es-CL', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(bDate);
                    return (
                      <tr key={b.id}>
                        <td>
                          <strong>{formattedDate} hrs</strong>
                        </td>
                        <td>
                          <strong>{b.customer_name}</strong>
                          <small style={{ display: 'block', color: '#71717a' }}>
                            {b.customer_phone || b.customer_email}
                          </small>
                        </td>
                        <td>
                          <strong>{b.service_name}</strong>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: b.professional_color || '#27272a',
                              }}
                            />
                            <span>{b.professional_name}</span>
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: '15px', color: '#b91c1c' }}>
                            ${Number(b.amount_clp || 0).toLocaleString('es-CL')}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              style={{
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '7px',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                              onClick={() => void handleMarkBookingPaid(b)}
                            >
                              ✓ Marcar Pagada
                            </button>
                            {b.customer_phone && (
                              <button
                                type="button"
                                style={{
                                  background: '#25D366',
                                  color: '#ffffff',
                                  border: 'none',
                                  padding: '6px 10px',
                                  borderRadius: '7px',
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                                title="Recordar pago por WhatsApp"
                                onClick={() => handleSendBookingCollection(b)}
                              >
                                💬 WA
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : activeTab === 'historial' ? (
            filteredPayments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#71717a' }}>
                <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>💳</span>
                <strong style={{ fontSize: '16px', color: '#18181b', display: 'block' }}>
                  No se registran pagos en el historial
                </strong>
                <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                  A medida que registres pagos de alumnos o cuotas mensuales, se listarán aquí.
                </p>
              </div>
            ) : (
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th>Fecha de Pago</th>
                    <th>Alumno</th>
                    <th>Período / Mes</th>
                    <th>Monto Recibido</th>
                    <th>Medio de Pago</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const cust = customers.find((c) => c.id === p.customer_id);
                    const pDate = new Date(p.payment_date * 1000);
                    const dateFormatted = new Intl.DateTimeFormat('es-CL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }).format(pDate);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{dateFormatted}</strong>
                        </td>
                        <td>
                          <strong>{cust?.name || `Alumno #${p.customer_id}`}</strong>
                          <small style={{ display: 'block', color: '#71717a' }}>
                            {cust?.phone || cust?.email}
                          </small>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{p.period}</span>
                        </td>
                        <td>
                          <strong style={{ fontSize: '14px', color: '#047857' }}>
                            +${Number(p.amount || 0).toLocaleString('es-CL')}
                          </strong>
                        </td>
                        <td>
                          <span style={{ textTransform: 'capitalize' }}>
                            {p.payment_method === 'transfer'
                              ? '🏦 Transferencia'
                              : p.payment_method === 'cash'
                              ? '💵 Efectivo'
                              : p.payment_method === 'card'
                              ? '💳 Tarjeta'
                              : p.payment_method}
                          </span>
                        </td>
                        <td>
                          <small style={{ color: '#71717a' }}>{p.notes || '—'}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            /* Tab: Todos los Alumnos */
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Plan Actual</th>
                  <th>Cuota</th>
                  <th>Vencimiento</th>
                  <th>Estado de Pago</th>
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllStudents.map((c) => {
                  const isOverdue = c.membership_status === 'overdue';
                  const isPending = c.membership_status === 'pending';
                  const isActive = c.membership_status === 'active';
                  const isInactive = c.membership_status === 'inactive';
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <small style={{ display: 'block', color: '#71717a' }}>
                          {c.phone || c.email}
                        </small>
                      </td>
                      <td>{c.plan_name || 'Mensualidad Regular'}</td>
                      <td>
                        <strong>${Number(c.monthly_fee || 0).toLocaleString('es-CL')}</strong>
                      </td>
                      <td>
                        {c.next_payment_due ? formatDate(c.next_payment_due) : `Día ${c.payment_due_day || 5}`}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            background: isActive
                              ? '#dcfce7'
                              : isPending
                              ? '#fef3c7'
                              : isOverdue
                              ? '#fee2e2'
                              : '#f4f4f5',
                            color: isActive
                              ? '#15803d'
                              : isPending
                              ? '#b45309'
                              : isOverdue
                              ? '#b91c1c'
                              : '#71717a',
                            border: isActive
                              ? '1px solid #bbf7d0'
                              : isPending
                              ? '1px solid #fde68a'
                              : isOverdue
                              ? '1px solid #fecaca'
                              : '1px solid #e4e4e7',
                          }}
                        >
                          {isActive
                            ? '🟢 Al día'
                            : isPending
                            ? '🟡 Por vencer'
                            : isOverdue
                            ? '🔴 Vencida'
                            : '⚪ Inactivo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          style={{
                            background: '#27272a',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '7px',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleOpenPayStudent(c)}
                        >
                          💵 Registrar Pago
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Registrar Pago o Abono de Alumno */}
      {payingStudent && (
        <div className="modal-backdrop" onClick={() => setPayingStudent(null)}>
          <form
            className="new-booking-modal"
            style={{ maxWidth: '540px' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmPayment}
          >
            <button type="button" className="close-modal" onClick={() => setPayingStudent(null)}>×</button>
            <p className="eyebrow" style={{ color: paymentType === 'abono' ? '#b45309' : '#16a34a' }}>
              {paymentType === 'abono' ? 'REGISTRAR ABONO PARCIAL' : 'REGISTRAR PAGO RECIBIDO'}
            </p>
            <h2>{paymentType === 'abono' ? 'Abonar a Deuda Pendiente' : 'Abono / Pago de Cuota'}</h2>
            <p style={{ margin: '0 0 16px', color: '#52525b', fontSize: '13px' }}>
              Alumno: <strong>{payingStudent.name}</strong> · Plan: <strong>{payingStudent.plan_name || 'Mensualidad'}</strong>
            </p>

            {/* Toggle Tipo: Pago Completo vs Abonar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '16px',
                background: '#f4f4f5',
                padding: '4px',
                borderRadius: '8px',
              }}
            >
              <button
                type="button"
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: paymentType === 'full' ? '#ffffff' : 'transparent',
                  color: paymentType === 'full' ? '#18181b' : '#71717a',
                  boxShadow: paymentType === 'full' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onClick={() => {
                  setPaymentType('full');
                  setPayingAmount(payingStudent.monthly_fee || 35000);
                }}
              >
                <span>🟢</span> Pago Completo (${Number(payingStudent.monthly_fee || 0).toLocaleString('es-CL')})
              </button>
              <button
                type="button"
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: paymentType === 'abono' ? '#ffffff' : 'transparent',
                  color: paymentType === 'abono' ? '#18181b' : '#71717a',
                  boxShadow: paymentType === 'abono' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onClick={() => {
                  setPaymentType('abono');
                  const half = Math.round(Number(payingStudent.monthly_fee || 35000) / 2);
                  setPayingAmount(half > 0 ? half : 15000);
                }}
              >
                <span>💰</span> Abonar Parte de la Deuda
              </button>
            </div>

            {/* Cálculo en vivo de Abono */}
            {paymentType === 'abono' && (
              <div
                style={{
                  background: '#fefce8',
                  border: '1px solid #fef08a',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                }}
              >
                <div>
                  <div style={{ color: '#713f12', fontWeight: 600 }}>Deuda Actual: ${Number(payingStudent.monthly_fee || 0).toLocaleString('es-CL')}</div>
                  <div style={{ color: '#854d0e', fontSize: '12px', marginTop: '2px' }}>
                    Abonando hoy: <strong>${Number(payingAmount || 0).toLocaleString('es-CL')}</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <small style={{ color: '#a16207', display: 'block' }}>Saldo restante por pagar:</small>
                  <strong style={{ fontSize: '16px', color: '#b91c1c' }}>
                    ${Math.max(0, Number(payingStudent.monthly_fee || 0) - Number(payingAmount || 0)).toLocaleString('es-CL')}
                  </strong>
                </div>
              </div>
            )}

            <div className="form-grid">
              <label className="full">
                {paymentType === 'abono' ? 'Monto a Abonar (CLP) *' : 'Monto Pagado (CLP) *'}
                <input
                  name="amount"
                  type="number"
                  min="1"
                  step="1000"
                  required
                  value={payingAmount}
                  onChange={(e) => setPayingAmount(e.target.value)}
                />
              </label>

              <label>
                Mes / Período del Pago
                <input
                  name="period"
                  required
                  value={payingPeriod}
                  onChange={(e) => setPayingPeriod(e.target.value)}
                  placeholder="Ej: Octubre 2026"
                />
              </label>

              <label>
                Medio de Pago
                <select
                  name="paymentMethod"
                  value={payingMethod}
                  onChange={(e) => setPayingMethod(e.target.value)}
                >
                  <option value="transfer">🏦 Transferencia Bancaria</option>
                  <option value="cash">💵 Efectivo</option>
                  <option value="card">💳 Tarjeta de Débito / Crédito</option>
                  <option value="other">⚙️ Otro medio</option>
                </select>
              </label>

              {paymentType === 'abono' && (
                <label className="full">
                  Fecha límite para pagar el saldo restante (opcional)
                  <input
                    type="date"
                    value={abonoNewDueDate}
                    onChange={(e) => setAbonoNewDueDate(e.target.value)}
                  />
                </label>
              )}

              <label className="full">
                Notas / Referencia de Transferencia
                <input
                  name="notes"
                  value={payingNotes}
                  onChange={(e) => setPayingNotes(e.target.value)}
                  placeholder="Ej: N° operación 19482, abono acordado"
                />
              </label>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}

            <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={() => setPayingStudent(null)}>Cancelar</button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: paymentType === 'abono' ? '#b45309' : '#10b981',
                  color: '#ffffff',
                  fontWeight: 600,
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {saving
                  ? 'Guardando…'
                  : paymentType === 'abono'
                  ? `💰 Confirmar Abono de $${Number(payingAmount || 0).toLocaleString('es-CL')}`
                  : '✓ Confirmar Pago y Poner Al Día'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Notificación de Recibo generado */}
      {receiptNotice && (
        <div className="modal-backdrop" onClick={() => setReceiptNotice(null)}>
          <div
            className="new-booking-modal"
            style={{ maxWidth: '480px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: '38px', display: 'inline-block', marginBottom: '8px' }}>
              {receiptNotice.isAbono ? '💰' : '✓'}
            </span>
            <p className="eyebrow" style={{ color: receiptNotice.isAbono ? '#b45309' : '#16a34a' }}>
              {receiptNotice.isAbono ? 'ABONO CONFIRMADO' : 'PAGO CONFIRMADO'}
            </p>
            <h2 style={{ margin: '6px 0 10px' }}>
              {receiptNotice.isAbono ? '¡Abono registrado con éxito!' : '¡Pago registrado con éxito!'}
            </h2>
            <p style={{ color: '#52525b', fontSize: '14px', lineHeight: 1.5, margin: '0 0 16px' }}>
              {receiptNotice.isAbono ? (
                <>
                  Se registró un abono de <strong>${receiptNotice.amount.toLocaleString('es-CL')}</strong> para{' '}
                  <strong>{receiptNotice.studentName}</strong> ({receiptNotice.period}).<br />
                  Saldo restante por cobrar: <strong style={{ color: '#b91c1c' }}>${(receiptNotice.remainingBalance || 0).toLocaleString('es-CL')}</strong>.
                </>
              ) : (
                <>
                  Se registró el pago de <strong>${receiptNotice.amount.toLocaleString('es-CL')}</strong> para{' '}
                  <strong>{receiptNotice.studentName}</strong> ({receiptNotice.period}). Su estado quedó actualizado a <strong>Al día 🟢</strong>.
                </>
              )}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {receiptNotice.whatsappUrl && (
                <a
                  href={receiptNotice.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#25D366',
                    color: '#ffffff',
                    padding: '11px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '13px',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                  onClick={() => setReceiptNotice(null)}
                >
                  <span>💬</span> Enviar Comprobante por WhatsApp al Alumno
                </a>
              )}
              <button
                type="button"
                style={{
                  background: '#27272a',
                  color: '#ffffff',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setReceiptNotice(null)}
              >
                Listo, cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ingresar o Modificar Deudor Manual */}
      {debtorModalOpen && (
        <div className="modal-backdrop" onClick={() => !savingDebtor && setDebtorModalOpen(false)}>
          <form
            className="new-booking-modal"
            style={{ maxWidth: '560px' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveDebtor}
          >
            <button
              type="button"
              className="close-modal"
              onClick={() => !savingDebtor && setDebtorModalOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow" style={{ color: '#b91c1c' }}>GESTIÓN MANUAL DE DEUDAS</p>
            <h2>{debtorMode === 'existing' && debtorSelectedId ? 'Editar / Asignar Deuda a Alumno' : 'Ingresar Deudor Manual'}</h2>
            <p style={{ margin: '0 0 16px', color: '#52525b', fontSize: '13px' }}>
              Registra una cuota impaga, mensualidad vencida o deuda particular para dar seguimiento y cobrar.
            </p>

            {/* Selector de modo: Alumno Existente vs Nuevo Deudor */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '16px',
                background: '#f4f4f5',
                padding: '4px',
                borderRadius: '8px',
              }}
            >
              <button
                type="button"
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: debtorMode === 'new' ? '#ffffff' : 'transparent',
                  color: debtorMode === 'new' ? '#18181b' : '#71717a',
                  boxShadow: debtorMode === 'new' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                onClick={() => setDebtorMode('new')}
              >
                ➕ Nuevo Deudor
              </button>
              <button
                type="button"
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: debtorMode === 'existing' ? '#ffffff' : 'transparent',
                  color: debtorMode === 'existing' ? '#18181b' : '#71717a',
                  boxShadow: debtorMode === 'existing' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                onClick={() => setDebtorMode('existing')}
              >
                👤 Alumno Existente
              </button>
            </div>

            <div className="form-grid">
              {debtorMode === 'existing' ? (
                <label className="full">
                  Seleccionar Alumno de la lista *
                  <select
                    value={debtorSelectedId}
                    onChange={(e) => handleSelectExistingStudent(e.target.value)}
                    required
                  >
                    <option value="">-- Elige un alumno registrado --</option>
                    {customers.map((cust) => (
                      <option key={cust.id} value={cust.id}>
                        {cust.name} {cust.phone ? `(${cust.phone})` : ''} - {cust.plan_name || 'Plan'} (${Number(cust.monthly_fee || 0).toLocaleString('es-CL')})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="full">
                  Nombre Completo del Deudor *
                  <input
                    required
                    placeholder="Ej: Marcelo Gómez"
                    value={debtorName}
                    onChange={(e) => setDebtorName(e.target.value)}
                  />
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#27272a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Teléfono / WhatsApp
                </span>
                <input
                  type="tel"
                  placeholder="+56 9 1234 5678"
                  value={debtorPhone}
                  onChange={(e) => setDebtorPhone(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#27272a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Correo Electrónico (opcional)
                </span>
                <input
                  type="email"
                  placeholder="alumno@correo.cl"
                  value={debtorEmail}
                  onChange={(e) => setDebtorEmail(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </label>

              <label className="full">
                Concepto o Detalle de la Deuda *
                <input
                  required
                  placeholder="Ej: Mensualidad Septiembre, Cuota atrasada, Clase particular..."
                  value={debtorConcept}
                  onChange={(e) => setDebtorConcept(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {['Mensualidad', 'Abono pendiente', 'Cuota atrasada', 'Clase particular', 'Matrícula', 'Saldo pendiente'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      style={{
                        background: '#f4f4f5',
                        border: '1px solid #e4e4e7',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        color: '#52525b',
                        cursor: 'pointer',
                      }}
                      onClick={() => setDebtorConcept(sug)}
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#27272a', whiteSpace: 'nowrap' }}>
                  Monto Adeudado (CLP) *
                </span>
                <input
                  type="number"
                  min="1"
                  step="1000"
                  required
                  placeholder="35000"
                  value={debtorAmount}
                  onChange={(e) => setDebtorAmount(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#27272a', whiteSpace: 'nowrap' }}>
                  Estado Inicial de la Deuda
                </span>
                <select
                  value={debtorStatus}
                  onChange={(e) => setDebtorStatus(e.target.value as 'overdue' | 'pending')}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                >
                  <option value="overdue">🔴 Cuota Vencida / En Mora</option>
                  <option value="pending">🟡 Por Vencer / Próxima</option>
                </select>
              </label>

              <label className="full">
                Fecha Límite / Vencimiento
                <input
                  type="date"
                  required
                  value={debtorDueDate}
                  onChange={(e) => setDebtorDueDate(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button
                    type="button"
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      color: '#b91c1c',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setDateShortcut(-7)}
                  >
                    Hace 7 días (Moroso)
                  </button>
                  <button
                    type="button"
                    style={{
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      color: '#27272a',
                      cursor: 'pointer',
                    }}
                    onClick={() => setDateShortcut(0)}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    style={{
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      color: '#b45309',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setDateShortcut(3)}
                  >
                    En 3 días (Por vencer)
                  </button>
                  <button
                    type="button"
                    style={{
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      color: '#27272a',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const now = new Date();
                      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      setDebtorDueDate(lastDay.toISOString().split('T')[0]);
                    }}
                  >
                    Fin de este mes
                  </button>
                </div>
              </label>

              <label className="full">
                Notas / Compromiso de Pago (opcional)
                <input
                  placeholder="Ej: Avisó que transfiere este viernes después de las 18 hrs."
                  value={debtorNotes}
                  onChange={(e) => setDebtorNotes(e.target.value)}
                />
              </label>
            </div>

            {debtorError && (
              <div className="form-error" role="alert" style={{ marginTop: '12px' }}>
                {debtorError}
              </div>
            )}

            <div
              className="modal-footer"
              style={{
                marginTop: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                disabled={savingDebtor}
                onClick={() => setDebtorModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingDebtor}
                style={{
                  background: '#18181b',
                  color: '#ffffff',
                  fontWeight: 600,
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {savingDebtor ? 'Guardando…' : '💾 Guardar Deudor'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type Service = {
  id: number;
  name: string;
  description: string | null;
  mode: 'presencial' | 'online' | 'hibrido';
  class_type: 'individual' | 'grupal';
  capacity: number;
  billing_period?: 'mensual' | 'anual' | 'sesion';
  schedule?: string | null;
  duration_minutes: number;
  price_clp: number;
  deposit_percent: number;
  active: number | boolean;
  booking_count: number;
  paid_total: number;
};

function ServicesModule({ demo }: { demo: (message: string) => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'todos' | 'mensuales' | 'anuales' | 'grupales' | 'individuales' | 'pausadas'>('todos');
  const [formClassType, setFormClassType] = useState<'individual' | 'grupal'>('grupal');
  const [formBillingPeriod, setFormBillingPeriod] = useState<'mensual' | 'anual' | 'sesion'>('mensual');
  const DAYS_OF_WEEK = [
    { key: 'Lun', label: 'Lunes' },
    { key: 'Mar', label: 'Martes' },
    { key: 'Mié', label: 'Miércoles' },
    { key: 'Jue', label: 'Jueves' },
    { key: 'Vie', label: 'Viernes' },
    { key: 'Sáb', label: 'Sábado' },
    { key: 'Dom', label: 'Domingo' },
  ];

  const TIME_OPTIONS = [
    '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
    '21:00', '21:30', '22:00', '22:30', '23:00'
  ];

  const [formSchedule, setFormSchedule] = useState('');
  const [scheduleSlots, setScheduleSlots] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Lun', 'Mié', 'Vie']);
  const [slotStart, setSlotStart] = useState('18:30');
  const [slotEnd, setSlotEnd] = useState('19:30');

  function formatDaysSummary(days: string[]): string {
    if (days.length === 0) return '';
    if (days.length === 7) return 'Todos los días';
    const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const sorted = [...days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

    const isLmv = sorted.length === 3 && sorted[0] === 'Lun' && sorted[1] === 'Mié' && sorted[2] === 'Vie';
    if (isLmv) return 'Lun, Mié y Vie';

    const isMj = sorted.length === 2 && sorted[0] === 'Mar' && sorted[1] === 'Jue';
    if (isMj) return 'Mar y Jue';

    const isLunesViernes = sorted.length === 5 && sorted[0] === 'Lun' && sorted[1] === 'Mar' && sorted[2] === 'Mié' && sorted[3] === 'Jue' && sorted[4] === 'Vie';
    if (isLunesViernes) return 'Lunes a Viernes';

    const isFinde = sorted.length === 2 && sorted[0] === 'Sáb' && sorted[1] === 'Dom';
    if (isFinde) return 'Sáb y Dom';

    if (sorted.length === 1) {
      if (sorted[0] === 'Sáb') return 'Sábados';
      if (sorted[0] === 'Dom') return 'Domingos';
      return sorted[0];
    }

    if (sorted.length === 2) return `${sorted[0]} y ${sorted[1]}`;
    return `${sorted.slice(0, -1).join(', ')} y ${sorted[sorted.length - 1]}`;
  }

  function addCurrentSlot() {
    if (selectedDays.length === 0) return;
    const daysText = formatDaysSummary(selectedDays);
    const newSlot = `${daysText} ${slotStart} - ${slotEnd}`;
    if (!scheduleSlots.includes(newSlot)) {
      const nextSlots = [...scheduleSlots, newSlot];
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    }
  }

  function removeSlot(index: number) {
    const nextSlots = scheduleSlots.filter((_, i) => i !== index);
    setScheduleSlots(nextSlots);
    setFormSchedule(nextSlots.join(' / '));
  }

  function toggleDay(dayKey: string) {
    if (selectedDays.includes(dayKey)) {
      setSelectedDays(selectedDays.filter(d => d !== dayKey));
    } else {
      setSelectedDays([...selectedDays, dayKey]);
    }
  }

  function addPreset(presetText: string) {
    if (!scheduleSlots.includes(presetText)) {
      const nextSlots = [...scheduleSlots, presetText];
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    }
  }

  function openNewService() {
    setEditing(null);
    setFormClassType('grupal');
    setFormBillingPeriod('mensual');
    setFormSchedule('');
    setScheduleSlots([]);
    setSelectedDays(['Lun', 'Mié', 'Vie']);
    setSlotStart('18:30');
    setSlotEnd('19:30');
    setShowForm(true);
    setError('');
  }

  function openEditService(s: Service) {
    setEditing(s);
    setFormClassType(s.class_type || 'grupal');
    setFormBillingPeriod(s.billing_period || 'mensual');
    const rawSched = s.schedule || '';
    setFormSchedule(rawSched);
    const parsed = rawSched ? rawSched.split(' / ').map(x => x.trim()).filter(Boolean) : [];
    setScheduleSlots(parsed);
    setSelectedDays(['Lun', 'Mié', 'Vie']);
    setSlotStart('18:30');
    setSlotEnd('19:30');
    setShowForm(true);
    setError('');
  }

  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [hasUpcomingBookings, setHasUpcomingBookings] = useState(false);

  async function loadServices() {
    try {
      const response = await fetch('/api/services', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar las clases.');
      const data = await response.json() as { services: Service[] };
      setServices(data.services);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'No fue posible cargar las clases.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadServices(); }, []);

  const visible = services.filter(s => {
    if (filter === 'todos') return true;
    if (filter === 'pausadas') return !Boolean(s.active);
    if (filter === 'mensuales') return Boolean(s.active) && (s.billing_period === 'mensual' || !s.billing_period);
    if (filter === 'anuales') return Boolean(s.active) && s.billing_period === 'anual';
    if (filter === 'grupales') return Boolean(s.active) && s.class_type === 'grupal';
    if (filter === 'individuales') return Boolean(s.active) && s.class_type === 'individual';
    return true;
  });

  const activeCount = services.filter(s => Boolean(s.active)).length;
  const groupCount = services.filter(s => Boolean(s.active) && s.class_type === 'grupal').length;
  const individualCount = services.filter(s => Boolean(s.active) && s.class_type === 'individual').length;
  const monthlyCount = services.filter(s => Boolean(s.active) && (s.billing_period === 'mensual' || !s.billing_period)).length;
  const annualCount = services.filter(s => Boolean(s.active) && s.billing_period === 'anual').length;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (editing) payload.id = String(editing.id);
    try {
      const response = await fetch('/api/services', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar la clase.');
      await loadServices();
      setShowForm(false);
      setEditing(null);
      demo(result.message ?? 'Clase guardada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la clase.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(service: Service) {
    try {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: service.id, active: !Boolean(service.active) }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error);
      await loadServices();
      demo(result.message ?? 'Estado de la clase actualizado.');
    } catch (e) {
      demo(e instanceof Error ? e.message : 'No se pudo actualizar la clase.');
    }
  }

  async function executeDelete(id: number, force = false) {
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/services?id=${id}${force ? '&force=1' : ''}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string; message?: string; hasUpcoming?: boolean };
      if (!response.ok) {
        if (result.hasUpcoming) {
          setHasUpcomingBookings(true);
        }
        throw new Error(result.error ?? 'No se pudo eliminar la clase.');
      }
      await loadServices();
      setConfirmDelete(null);
      setHasUpcomingBookings(false);
      demo(result.message ?? 'Clase eliminada.');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar la clase.');
    } finally {
      setDeleting(false);
    }
  }

  const modeLabel = { presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido' };

  return (
    <div className="services-content">
      <div className="services-titlebar">
        <div>
          <p className="eyebrow">CATÁLOGO Y DISCIPLINAS</p>
          <h1>Clases y Cupos</h1>
          <p>Configura tus clases mensuales, anuales o por sesión, con cupo máximo asignado.</p>
        </div>
        <button className="primary" onClick={openNewService}>
          <span>＋</span> Nueva clase / servicio
        </button>
      </div>

      <div className="service-stats">
        <article>
          <span className="purple">📅</span>
          <div>
            <small>Planes Mensuales</small>
            <strong>{monthlyCount}</strong>
          </div>
        </article>
        <article>
          <span className="gold">🗓️</span>
          <div>
            <small>Planes Anuales</small>
            <strong>{annualCount}</strong>
          </div>
        </article>
        <article>
          <span className="mint">👥</span>
          <div>
            <small>Clases Grupales</small>
            <strong>{groupCount}</strong>
          </div>
        </article>
        <article>
          <span style={{ background: '#e4e4e7', color: '#27272a' }}>👤</span>
          <div>
            <small>Particulares 1 a 1</small>
            <strong>{individualCount}</strong>
          </div>
        </article>
      </div>

      <div className="service-filter">
        <div>
          <button className={filter === 'todos' ? 'active' : ''} onClick={() => setFilter('todos')}>
            Todas <span>{services.length}</span>
          </button>
          <button className={filter === 'mensuales' ? 'active' : ''} onClick={() => setFilter('mensuales')}>
            📅 Mensuales <span>{monthlyCount}</span>
          </button>
          <button className={filter === 'anuales' ? 'active' : ''} onClick={() => setFilter('anuales')}>
            🗓️ Anuales <span>{annualCount}</span>
          </button>
          <button className={filter === 'grupales' ? 'active' : ''} onClick={() => setFilter('grupales')}>
            Grupales <span>{groupCount}</span>
          </button>
          <button className={filter === 'individuales' ? 'active' : ''} onClick={() => setFilter('individuales')}>
            Individuales <span>{individualCount}</span>
          </button>
          <button className={filter === 'pausadas' ? 'active' : ''} onClick={() => setFilter('pausadas')}>
            Pausadas <span>{services.length - activeCount}</span>
          </button>
        </div>
        <small>Solo las clases activas están disponibles en la agenda y reservas online.</small>
      </div>

      <section className="service-grid">
        {loading ? (
          <div className="services-empty">Cargando clases…</div>
        ) : visible.length === 0 ? (
          <div className="services-empty">No hay clases en esta categoría.</div>
        ) : (
          visible.map((s, index) => {
            const isActive = Boolean(s.active);
            return (
              <article className={!isActive ? 'service-card paused' : 'service-card'} key={s.id}>
                <div className="service-card-head">
                  <span className={`service-symbol tone-${index % 4}`}>
                    {s.class_type === 'grupal' ? '👥' : '👤'}
                  </span>
                  <div>
                    <div className="member-name-row">
                      <strong>{s.name}</strong>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontWeight: 700,
                          background: s.billing_period === 'anual' ? '#fef3c7' : s.billing_period === 'sesion' ? '#f3f4f6' : '#e0e7ff',
                          color: s.billing_period === 'anual' ? '#b45309' : s.billing_period === 'sesion' ? '#374151' : '#3730a3',
                          border: s.billing_period === 'anual' ? '1px solid #fde68a' : s.billing_period === 'sesion' ? '1px solid #e5e7eb' : '1px solid #c7d2fe',
                        }}>
                          {s.billing_period === 'anual' ? '🗓️ Anual' : s.billing_period === 'sesion' ? '🎟️ Por Sesión' : '📅 Mensual'}
                        </span>
                        <span className={`status-pill ${isActive ? 'active' : 'inactive'}`}>
                          {isActive ? 'Activa' : 'Pausada'}
                        </span>
                      </div>
                    </div>
                    <small>
                      {s.class_type === 'grupal' ? `Grupal · Cupo max: ${s.capacity || 10} alumnos` : 'Individual (1 a 1)'} · {modeLabel[s.mode]}
                    </small>
                  </div>
                  <div className="member-top-actions">
                    <button
                      type="button"
                      className="action-btn-icon"
                      title="Editar clase"
                      onClick={() => openEditService(s)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="action-btn-icon delete"
                      title="Eliminar clase"
                      onClick={() => {
                        setConfirmDelete(s);
                        setDeleteError('');
                        setHasUpcomingBookings(false);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <p>{s.description || 'Sin descripción.'}</p>
                {s.schedule ? (
                  <div style={{
                    margin: '6px 0 10px',
                    padding: '6px 10px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <span style={{ fontSize: '13px' }}>🕒</span>
                    <span><strong>Horario:</strong> {s.schedule}</span>
                  </div>
                ) : (
                  <div style={{
                    margin: '4px 0 8px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <span>🕒</span>
                    <span>Sin horario fijado</span>
                  </div>
                )}
                <div className="service-details">
                  <span>◷ <b>{s.duration_minutes} min</b></span>
                  <span>
                    💳 <b>${Number(s.price_clp).toLocaleString('es-CL')}</b>
                    <small style={{ color: '#71717a', marginLeft: '3px', fontSize: '11px', fontWeight: 600 }}>
                      {s.billing_period === 'anual' ? '/año' : s.billing_period === 'sesion' ? '/sesión' : '/mes'}
                    </small>
                  </span>
                  <span>👥 <b>{s.class_type === 'grupal' ? `${s.capacity || 10} cupos` : '1 cupo'}</b></span>
                </div>
                <footer>
                  <label>
                    <input type="checkbox" checked={isActive} onChange={() => void toggle(s)} />
                    <i />{isActive ? 'Clase Activa' : 'Pausada'}
                  </label>
                  <div className="service-footer-actions">
                    <button
                      type="button"
                      className="btn-edit"
                      onClick={() => openEditService(s)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-delete"
                      onClick={() => {
                        setConfirmDelete(s);
                        setDeleteError('');
                        setHasUpcomingBookings(false);
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </footer>
              </article>
            );
          })
        )}
      </section>

      {/* Modal: Crear / Editar Clase */}
      {showForm && (
        <div className="modal-backdrop">
          <form className="new-booking-modal service-form" onSubmit={save}>
            <button
              type="button"
              className="close-modal"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setError('');
              }}
            >
              ×
            </button>
            <p className="eyebrow">{editing ? 'EDITAR CLASE / SERVICIO' : 'NUEVA CLASE / SERVICIO'}</p>
            <h2>{editing ? 'Actualizar detalles del servicio' : 'Crear nuevo servicio'}</h2>
            <p>Configura si el servicio se cobra de forma mensual o anual, su aforo y condiciones.</p>

            <div className="form-grid">
              <label className="full">Nombre del servicio o clase
                <input name="name" required defaultValue={editing?.name ?? ''} placeholder="Ej: Yoga Hatha Mensual, Membresía Anual Crossfit" />
              </label>

              <label>Cobro / Periodicidad
                <select
                  name="billingPeriod"
                  value={formBillingPeriod}
                  onChange={e => setFormBillingPeriod(e.target.value as any)}
                >
                  <option value="mensual">📅 Cobro Mensual (Plan / Mensualidad)</option>
                  <option value="anual">🗓️ Cobro Anual (Membresía / Pago Anual)</option>
                  <option value="sesion">🎟️ Por Clase / Sesión Suelta</option>
                </select>
              </label>

              <label>Tipo de clase
                <select
                  name="classType"
                  value={formClassType}
                  onChange={e => setFormClassType(e.target.value as any)}
                >
                  <option value="grupal">Grupal (Con cupo limitado)</option>
                  <option value="individual">Individual (1 a 1 particular)</option>
                </select>
              </label>

              {formClassType === 'grupal' ? (
                <label>Cupo límite de alumnos
                  <input
                    name="capacity"
                    type="number"
                    min="2"
                    max="100"
                    required
                    defaultValue={editing?.capacity ?? 12}
                    placeholder="12"
                  />
                </label>
              ) : (
                <label>Capacidad
                  <input name="capacity" type="number" readOnly value="1" style={{ background: '#f5f5f5' }} />
                </label>
              )}

              <label>Modalidad
                <select name="mode" defaultValue={editing?.mode ?? 'presencial'}>
                  <option value="presencial">Presencial</option>
                  <option value="online">Online</option>
                  <option value="hibrido">Híbrido</option>
                </select>
              </label>

              <label>Duración (minutos)
                <select name="durationMinutes" defaultValue={editing?.duration_minutes ?? 60}>
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                  <option value="75">75 minutos</option>
                  <option value="90">90 minutos</option>
                  <option value="120">120 minutos</option>
                </select>
              </label>

              <label>
                {formBillingPeriod === 'mensual'
                  ? 'Valor Cuota Mensual (CLP)'
                  : formBillingPeriod === 'anual'
                  ? 'Valor Membresía Anual (CLP)'
                  : 'Precio por sesión (CLP)'}
                <input
                  name="priceClp"
                  type="number"
                  min="0"
                  step="1000"
                  required
                  defaultValue={editing?.price_clp ?? (formBillingPeriod === 'anual' ? 350000 : 35000)}
                />
              </label>

              <div
                className="full"
                style={{
                  gridColumn: '1 / -1',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  margin: '4px 0',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      🗓️ Horario de la Clase
                    </span>
                    {scheduleSlots.length > 0 && (
                      <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                        {scheduleSlots.length} {scheduleSlots.length === 1 ? 'bloque configurado' : 'bloques configurados'}
                      </span>
                    )}
                  </div>
                  <small style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>
                    Selecciona los días y el rango horario para agregar uno o más bloques a esta clase.
                  </small>
                </div>

                {/* 1. Selector de Días */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      1. Días en que se imparte:
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {selectedDays.length === 0 ? 'Ningún día seleccionado' : formatDaysSummary(selectedDays)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {DAYS_OF_WEEK.map(d => {
                      const isSelected = selectedDays.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => toggleDay(d.key)}
                          style={{
                            padding: '7px 13px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            background: isSelected ? '#18181b' : '#ffffff',
                            color: isSelected ? '#ffffff' : '#334155',
                            border: isSelected ? '1px solid #18181b' : '1px solid #cbd5e1',
                            boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          }}
                        >
                          {isSelected ? '✓ ' : ''}{d.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Atajos de grupos de días */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginRight: '4px' }}>Frecuentes:</span>
                    {[
                      { label: 'Lun, Mié y Vie', days: ['Lun', 'Mié', 'Vie'] },
                      { label: 'Mar y Jue', days: ['Mar', 'Jue'] },
                      { label: 'Lun a Vie', days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'] },
                      { label: 'Sábados', days: ['Sáb'] },
                      { label: 'Fines de semana', days: ['Sáb', 'Dom'] },
                      { label: 'Todos los días', days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] },
                    ].map(group => (
                      <button
                        key={group.label}
                        type="button"
                        onClick={() => setSelectedDays(group.days)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          color: '#475569',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Rango de Horas y Botón Agregar */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    2. Rango de hora del bloque:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 110px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                        Hora Inicio
                      </label>
                      <select
                        value={slotStart}
                        onChange={e => setSlotStart(e.target.value)}
                        style={{
                          width: '100%',
                          height: '40px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0 10px',
                          fontSize: '14px',
                          fontWeight: 500,
                          background: '#ffffff',
                          color: '#0f172a',
                        }}
                      >
                        {TIME_OPTIONS.slice(0, -1).map(t => (
                          <option key={`start-${t}`} value={t}>{t} hrs</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: '1 1 110px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                        Hora Término
                      </label>
                      <select
                        value={slotEnd}
                        onChange={e => setSlotEnd(e.target.value)}
                        style={{
                          width: '100%',
                          height: '40px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0 10px',
                          fontSize: '14px',
                          fontWeight: 500,
                          background: '#ffffff',
                          color: '#0f172a',
                        }}
                      >
                        {TIME_OPTIONS.slice(1).map(t => (
                          <option key={`end-${t}`} value={t}>{t} hrs</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={addCurrentSlot}
                      disabled={selectedDays.length === 0}
                      style={{
                        height: '40px',
                        padding: '0 18px',
                        background: selectedDays.length === 0 ? '#94a3b8' : '#18181b',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: selectedDays.length === 0 ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexShrink: 0,
                      }}
                    >
                      <span>＋</span> Agregar a este horario
                    </button>
                  </div>
                </div>

                {/* 3. Bloques asignados */}
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    Bloques configurados para esta clase:
                  </span>
                  {scheduleSlots.length === 0 ? (
                    <div style={{ padding: '12px', background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
                      No has agregado bloques aún. Elige los días y horas arriba y presiona &quot;＋ Agregar a este horario&quot;.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {scheduleSlots.map((slot, idx) => (
                        <div
                          key={`slot-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '8px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '15px' }}>🕒</span>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>{slot}</strong>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSlot(idx)}
                            title="Quitar este bloque"
                            style={{
                              border: 'none',
                              background: '#fee2e2',
                              color: '#dc2626',
                              borderRadius: '6px',
                              width: '24px',
                              height: '24px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Plantillas rápidas de 1 clic */}
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Plantillas rápidas de un clic:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      'Lun, Mié y Vie 18:30 - 19:30',
                      'Lun, Mié y Vie 19:30 - 20:30',
                      'Mar y Jue 18:30 - 19:30',
                      'Mar y Jue 19:30 - 20:30',
                      'Mar y Jue 20:30 - 21:30',
                      'Viernes 18:30 - 19:30',
                      'Sábado 10:30 - 11:30',
                    ].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => addPreset(preset)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Campo de texto final sincronizado */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', margin: 0 }}>
                      Texto del horario visible para alumnos:
                    </label>
                    {formSchedule && (
                      <button
                        type="button"
                        onClick={() => { setScheduleSlots([]); setFormSchedule(''); }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#dc2626',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Limpiar todo
                      </button>
                    )}
                  </div>
                  <input
                    name="schedule"
                    value={formSchedule}
                    onChange={e => {
                      setFormSchedule(e.target.value);
                      const parsed = e.target.value ? e.target.value.split(' / ').map(x => x.trim()).filter(Boolean) : [];
                      setScheduleSlots(parsed);
                    }}
                    placeholder="Ej: Lun, Mié y Vie 18:30 - 19:30 / Sábado 10:30 - 11:30"
                    style={{
                      width: '100%',
                      height: '42px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#0f172a',
                      fontWeight: 500,
                    }}
                  />
                  <small style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Se actualiza automáticamente con los bloques seleccionados, y también puedes editarlo manualmente si deseas añadir aclaraciones.
                  </small>
                </div>
              </div>

              <label className="full">Descripción de la clase o servicio
                <textarea name="description" rows={3} defaultValue={editing?.description ?? ''} placeholder="Describe qué incluye el plan, beneficios o requisitos" />
              </label>
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {editing ? (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => {
                    const toDelete = editing;
                    setShowForm(false);
                    setEditing(null);
                    setConfirmDelete(toDelete);
                    setDeleteError('');
                  }}
                >
                  🗑️ Eliminar clase
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</button>
                <button type="submit" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear clase'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Confirmar Eliminación de Clase */}
      {confirmDelete && (
        <div className="modal-backdrop">
          <div className="new-booking-modal" style={{ maxWidth: '490px' }}>
            <button
              type="button"
              className="close-modal"
              onClick={() => {
                setConfirmDelete(null);
                setDeleteError('');
              }}
            >
              ×
            </button>
            <p className="eyebrow" style={{ color: '#ef4444' }}>CONFIRMAR ACCIÓN</p>
            <h2 style={{ color: '#0f172a', margin: '0 0 8px' }}>¿Eliminar la clase &quot;{confirmDelete.name}&quot;?</h2>
            <p style={{ color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente esta disciplina y su configuración de cupos del sistema.
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px',
                margin: '14px 0',
                color: '#475569',
                fontSize: '13px',
              }}
            >
              <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                💡 ¿Prefieres pausar la clase?
              </strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Al pausar la clase, ya no estará disponible para nuevas inscripciones ni reservas públicas, pero mantendrás su historial de asistencias y registros.
              </span>
            </div>

            {deleteError && (
              <div style={{ marginBottom: '14px' }}>
                <div className="form-error" role="alert" style={{ marginBottom: '10px' }}>
                  {deleteError}
                </div>
                {hasUpcomingBookings && (
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #f87171',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    disabled={deleting}
                    onClick={() => void executeDelete(confirmDelete.id, true)}
                  >
                    ⚠️ {deleting ? 'Eliminando con reservas…' : 'Eliminar de todas formas (cancelando reservas)'}
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Boolean(confirmDelete.active) && (
                <button
                  type="button"
                  style={{
                    background: '#f1f5f9',
                    color: '#0f172a',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  onClick={async () => {
                    await toggle(confirmDelete);
                    setConfirmDelete(null);
                  }}
                >
                  ⏸️ Pausar clase en lugar de eliminar
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(null);
                    setDeleteError('');
                  }}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  disabled={deleting}
                  onClick={() => void executeDelete(confirmDelete.id)}
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar clase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


type TeamMember = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  color: string;
  active: number | boolean;
  booking_count: number;
  paid_total: number;
  upcoming_count: number;
};

function TeamModule({ demo }: { demo: (message: string) => void }) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [hasUpcomingBookings, setHasUpcomingBookings] = useState(false);

  async function loadTeam() {
    try {
      const response = await fetch('/api/team', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar el equipo.');
      const data = (await response.json()) as { team: TeamMember[] };
      setTeam(data.team);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'No fue posible cargar el equipo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  const activeCount = team.filter((m) => Boolean(m.active)).length;
  const bookings = team.reduce((n, m) => n + Number(m.booking_count), 0);
  const revenue = team.reduce((n, m) => n + Number(m.paid_total), 0);

  function initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join('')
      .toUpperCase();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(form.entries());
    if (editing) payload.id = String(editing.id);

    try {
      const response = await fetch('/api/team', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el integrante.');
      await loadTeam();
      setShowForm(false);
      setEditing(null);
      demo(result.message ?? 'Integrante guardado correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el integrante.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(member: TeamMember) {
    const nextState = !Boolean(member.active);
    try {
      const response = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, active: nextState }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo cambiar el estado.');
      await loadTeam();
      demo(result.message ?? (nextState ? `${member.name} activado.` : `${member.name} dado de baja.`));
    } catch (e) {
      demo(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    }
  }

  async function executeDelete(id: number, force = false) {
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/team?id=${id}${force ? '&force=1' : ''}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string; message?: string; hasUpcoming?: boolean };
      if (!response.ok) {
        if (result.hasUpcoming) {
          setHasUpcomingBookings(true);
        }
        throw new Error(result.error ?? 'No se pudo eliminar al instructor.');
      }
      await loadTeam();
      setConfirmDelete(null);
      setHasUpcomingBookings(false);
      demo(result.message ?? 'Instructor eliminado.');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar al instructor.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="team-content">
      <div className="team-titlebar">
        <div>
          <p className="eyebrow">INSTRUCTORES Y EQUIPO</p>
          <h1>Equipo</h1>
          <p>Administra a los instructores, controla su estado (activo o dado de baja) y gestiona sus clases.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
            setError('');
          }}
        >
          <span>＋</span> Nuevo instructor
        </button>
      </div>

      <div className="team-stats">
        <article>
          <span className="purple">♚</span>
          <div>
            <small>Instructores activos</small>
            <strong>{activeCount}</strong>
          </div>
        </article>
        <article>
          <span className="mint">▦</span>
          <div>
            <small>Reservas gestionadas</small>
            <strong>{bookings}</strong>
          </div>
        </article>
        <article>
          <span className="gold">$</span>
          <div>
            <small>Ingresos generados</small>
            <strong>${revenue.toLocaleString('es-CL')}</strong>
          </div>
        </article>
      </div>

      <section className="team-grid">
        {loading ? (
          <div className="team-empty">Cargando equipo…</div>
        ) : team.length === 0 ? (
          <div className="team-empty">No hay integrantes registrados en el equipo.</div>
        ) : (
          team.map((m) => {
            const isActive = Boolean(m.active);
            return (
              <article className={!isActive ? 'member-card paused' : 'member-card'} key={m.id}>
                <header>
                  <span style={{ background: `${m.color}25`, color: m.color, border: `1px solid ${m.color}40` }}>
                    {initials(m.name)}
                  </span>
                  <div>
                    <div className="member-name-row">
                      <strong>{m.name}</strong>
                      <span className={`status-pill ${isActive ? 'active' : 'inactive'}`}>
                        {isActive ? 'Activo' : 'Dado de baja'}
                      </span>
                    </div>
                    <small>{m.role}</small>
                  </div>
                  <div className="member-top-actions">
                    <button
                      type="button"
                      className="action-btn-icon"
                      title="Editar datos del instructor"
                      onClick={() => {
                        setEditing(m);
                        setShowForm(true);
                        setError('');
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="action-btn-icon delete"
                      title="Eliminar instructor"
                      onClick={() => {
                        setConfirmDelete(m);
                        setDeleteError('');
                        setHasUpcomingBookings(false);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </header>

                <div className="member-contact">
                  <span>✉ {m.email}</span>
                  <span>☎ {m.phone || 'Sin teléfono'}</span>
                </div>

                <div className="member-metrics">
                  <span>
                    <b>{m.upcoming_count}</b>
                    <small>Próximas</small>
                  </span>
                  <span>
                    <b>{m.booking_count}</b>
                    <small>Reservas</small>
                  </span>
                  <span>
                    <b>${Number(m.paid_total).toLocaleString('es-CL')}</b>
                    <small>Ingresos</small>
                  </span>
                </div>

                <div className="member-card-buttons">
                  <button
                    type="button"
                    className={`btn-card-action ${isActive ? 'deactivate' : 'activate'}`}
                    onClick={() => void toggle(m)}
                  >
                    {isActive ? 'Dar de baja' : 'Reactivar'}
                  </button>
                  <button
                    type="button"
                    className="btn-card-action"
                    onClick={() => {
                      setEditing(m);
                      setShowForm(true);
                      setError('');
                    }}
                  >
                    Editar perfil
                  </button>
                </div>

                <footer>
                  <label>
                    <input type="checkbox" checked={isActive} onChange={() => void toggle(m)} />
                    <i />
                    {isActive ? 'Agenda abierta' : 'Agenda pausada'}
                  </label>
                  <button type="button" onClick={() => demo(`Agenda de ${m.name}`)}>
                    Ver agenda →
                  </button>
                </footer>
              </article>
            );
          })
        )}
      </section>

      <section className="team-note">
        <span>ℹ</span>
        <div>
          <strong>Control de estado e instructores</strong>
          <p>
            Al <b>dar de baja</b> a un instructor su agenda queda pausada y no podrá recibir nuevas reservas ni alumnos, pero se preserva todo su historial de clases y pagos. Si decides <b>eliminarlo</b>, se removerá por completo.
          </p>
        </div>
      </section>

      {/* MODAL CREAR / EDITAR */}
      {showForm && (
        <div className="modal-backdrop">
          <form className="new-booking-modal team-form" onSubmit={save}>
            <button
              type="button"
              className="close-modal"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setError('');
              }}
            >
              ×
            </button>
            <p className="eyebrow">{editing ? 'EDITAR INSTRUCTOR' : 'NUEVO INSTRUCTOR'}</p>
            <h2>{editing ? `Editar a ${editing.name}` : 'Agregar instructor al equipo'}</h2>
            <p>Configura los datos del instructor, su color identificador de agenda y su estado en el sistema.</p>

            <div className="form-grid">
              <label className="full">
                Nombre completo
                <input name="name" required defaultValue={editing?.name ?? ''} placeholder="Ej: Andrea Morales" />
              </label>
              <label>
                Correo electrónico
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={editing?.email ?? ''}
                  placeholder="instructor@negocio.cl"
                />
              </label>
              <label>
                Teléfono / WhatsApp
                <input
                  name="phone"
                  type="tel"
                  defaultValue={editing?.phone ?? ''}
                  placeholder="+56 9 1234 5678"
                />
              </label>
              <label>
                Especialidad o cargo
                <input
                  name="role"
                  required
                  defaultValue={editing?.role ?? 'Instructor'}
                  placeholder="Ej: Instructor de Funcional"
                />
              </label>
              <label>
                Color de agenda
                <div className="color-field">
                  <input name="color" type="color" defaultValue={editing?.color ?? '#7559f2'} />
                  <span>Identificador visual en calendario</span>
                </div>
              </label>
              <label className="full">
                Estado del instructor
                <select name="active" defaultValue={editing ? (Boolean(editing.active) ? '1' : '0') : '1'}>
                  <option value="1">🟢 Activo — Puede recibir reservas y dictar clases</option>
                  <option value="0">🔴 Dado de baja — Agenda pausada (no recibe reservas de alumnos)</option>
                </select>
              </label>
            </div>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {editing ? (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => {
                    const toDelete = editing;
                    setShowForm(false);
                    setEditing(null);
                    setConfirmDelete(toDelete);
                    setDeleteError('');
                    setHasUpcomingBookings(false);
                  }}
                >
                  🗑️ Eliminar instructor
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar instructor'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      {confirmDelete && (
        <div className="modal-backdrop">
          <div className="new-booking-modal" style={{ maxWidth: '490px' }}>
            <button
              type="button"
              className="close-modal"
              onClick={() => {
                setConfirmDelete(null);
                setDeleteError('');
              }}
            >
              ×
            </button>
            <p className="eyebrow" style={{ color: '#ef4444' }}>CONFIRMAR ACCIÓN</p>
            <h2 style={{ color: '#0f172a', margin: '0 0 8px' }}>¿Eliminar a {confirmDelete.name}?</h2>
            <p style={{ color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente al instructor del sistema.
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px',
                margin: '14px 0',
                color: '#475569',
                fontSize: '13px',
              }}
            >
              <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                💡 ¿Prefieres &quot;Dar de baja&quot;?
              </strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Al dar de baja, el instructor ya no podrá recibir nuevas reservas ni impartir nuevas clases, pero se conservará su historial de clases pasadas y pagos.
              </span>
            </div>

            {deleteError && (
              <div style={{ marginBottom: '14px' }}>
                <div className="form-error" role="alert" style={{ marginBottom: '10px' }}>
                  {deleteError}
                </div>
                {hasUpcomingBookings && (
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #f87171',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    disabled={deleting}
                    onClick={() => void executeDelete(confirmDelete.id, true)}
                  >
                    ⚠️ {deleting ? 'Eliminando con clases…' : 'Eliminar de todas formas (cancelando sus clases)'}
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Boolean(confirmDelete.active) && (
                <button
                  type="button"
                  style={{
                    background: '#f1f5f9',
                    color: '#0f172a',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  onClick={async () => {
                    await toggle(confirmDelete);
                    setConfirmDelete(null);
                  }}
                >
                  ⏸️ Dar de baja en lugar de eliminar
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(null);
                    setDeleteError('');
                  }}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  disabled={deleting}
                  onClick={() => void executeDelete(confirmDelete.id)}
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar instructor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Settings={name:string;email:string|null;phone:string|null;address:string|null;description:string|null;timezone:string;currency:string;cancellation_hours:number;booking_window_days:number};
function SettingsModule({demo}:{demo:(message:string)=>void}){const [settings,setSettings]=useState<Settings|null>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');useEffect(()=>{fetch('/api/settings',{cache:'no-store'}).then(r=>r.json()).then((d:any)=>setSettings(d.settings as Settings)).catch(()=>demo('No fue posible cargar la configuración.'));},[]);async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setError('');const payload=Object.fromEntries(new FormData(e.currentTarget).entries());try{const r=await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json() as {error?:string;message?:string};if(!r.ok)throw new Error(d.error);demo(d.message??'Configuración guardada.');}catch(x){setError(x instanceof Error?x.message:'No se pudo guardar.');}finally{setSaving(false);}}return <div className="settings-content"><div className="settings-title"><p className="eyebrow">ADMINISTRACIÓN</p><h1>Configuración</h1><p>Define la identidad y las reglas de reserva de tu negocio.</p></div>{!settings?<div className="settings-loading">Cargando configuración…</div>:<form className="settings-form" onSubmit={save}><section><header><span>01</span><div><h2>Información del negocio</h2><p>Estos datos aparecerán en tu página pública.</p></div></header><div className="form-grid"><label className="full">Nombre del negocio<input name="name" required defaultValue={settings.name}/></label><label>Correo de contacto<input name="email" type="email" defaultValue={settings.email??''}/></label><label>Teléfono<input name="phone" defaultValue={settings.phone??''}/></label><label className="full">Dirección<input name="address" defaultValue={settings.address??''}/></label><label className="full">Descripción<textarea name="description" rows={4} defaultValue={settings.description??''}/></label></div></section><section><header><span>02</span><div><h2>Reglas de reserva</h2><p>Controla anticipación, cancelaciones y moneda.</p></div></header><div className="form-grid"><label>Zona horaria<select name="timezone" defaultValue={settings.timezone}><option value="America/Santiago">Santiago</option><option value="America/Bogota">Bogotá</option><option value="America/Mexico_City">Ciudad de México</option><option value="Europe/Madrid">Madrid</option></select></label><label>Moneda<select name="currency" defaultValue={settings.currency}><option>CLP</option><option>USD</option><option>EUR</option></select></label><label>Cancelación mínima (horas)<input name="cancellationHours" type="number" min="0" defaultValue={settings.cancellation_hours}/></label><label>Ventana de reserva (días)<input name="bookingWindowDays" type="number" min="1" max="365" defaultValue={settings.booking_window_days}/></label></div></section>{error&&<div className="form-error">{error}</div>}<footer><a href="/reservar" target="_blank">↗ Ver página pública</a><button className="primary" disabled={saving}>{saving?'Guardando…':'Guardar configuración'}</button></footer></form>}</div>}

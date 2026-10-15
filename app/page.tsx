'use client';

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';
import { ProfilesModule } from './components/ProfilesModule';
import { calculateRecurringSessions, splitScheduleString, parseScheduleToSlots, addMinutesToTime, calculateMinutesBetween, type ParsedSlot } from './lib/recurring';
import { parseChileDateTime } from './lib/dates';

const chileDateParts = (value: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const localDateKey = (date: Date) => { const p = chileDateParts(date); return `${p.year}-${p.month}-${p.day}`; };
const bookingDateKey = (seconds: number) => { const p = chileDateParts(new Date(seconds * 1000)); return `${p.year}-${p.month}-${p.day}`; };
const startOfWeek = (date: Date) => { const result = new Date(date); result.setHours(12, 0, 0, 0); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); return result; };
const addDays = (date: Date, days: number) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };

const TIME_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00', '22:30', '23:00'
];

export { parseScheduleToSlots, type ParsedSlot };

function SummaryDashboard({
  setActive,
  demo,
  sessionUser
}: {
  setActive: (view: string) => void;
  demo: (msg: string) => void;
  sessionUser?: { name?: string | null; email?: string | null } | null;
}) {
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

  const greetingName = useMemo(() => {
    if (!sessionUser?.name) return '';
    const first = sessionUser.name.trim().split(' ')[0];
    return first || sessionUser.name.trim();
  }, [sessionUser?.name]);

  const greetingTitle = useMemo(() => {
    const hour = new Date().getHours();
    const timeWord = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    return greetingName ? `${timeWord}, ${greetingName}` : timeWord;
  }, [greetingName]);

  return (
    <div className="content">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>{greetingTitle}</h1>
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
  isSuperAdmin?: boolean;
  business?: {
    id: number;
    name: string;
    slug: string;
    phone?: string | null;
  } | null;
}

function LoginView({ onLoginSuccess, demo }: { onLoginSuccess: (user: SessionUser) => void; demo: (msg: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

function AdminProfileModal({
  isOpen,
  onClose,
  sessionUser,
  onUpdateUser,
  demo,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionUser: SessionUser | null;
  onUpdateUser: (user: SessionUser) => void;
  demo: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  // Form profile
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Form password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    if (sessionUser) {
      setName(sessionUser.name || '');
      setEmail(sessionUser.email || '');
    }
  }, [sessionUser, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setProfileError('');
      setProfileSuccess('');
      setPasswordError('');
      setPasswordSuccess('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isSuper = Boolean(
    sessionUser?.isSuperAdmin ||
    sessionUser?.role === 'superadmin' ||
    sessionUser?.email?.toLowerCase().trim() === 'admin@agendando.cl' ||
    String(sessionUser?.id) === '1'
  );

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', name, email }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string; user?: SessionUser };
      if (!res.ok) {
        throw new Error(data.error || 'No fue posible actualizar tus datos.');
      }
      if (data.user) {
        onUpdateUser(data.user);
      }
      setProfileSuccess(data.message || 'Datos de perfil actualizados exitosamente.');
      demo(data.message || 'Perfil actualizado.');
    } catch (err: any) {
      setProfileError(err?.message || 'Error al actualizar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.');
      setSavingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('La confirmación de la nueva contraseña no coincide.');
      setSavingPassword(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', currentPassword, newPassword, confirmPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string; user?: SessionUser };
      if (!res.ok) {
        throw new Error(data.error || 'No fue posible cambiar la contraseña.');
      }
      if (data.user) {
        onUpdateUser(data.user);
      }
      setPasswordSuccess(data.message || 'Contraseña de ingreso actualizada exitosamente.');
      demo(data.message || 'Contraseña actualizada.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err?.message || 'Error al actualizar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div
      className="admin-profile-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-profile-modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Mi Cuenta de Administrador
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
              Edita tus datos personales o cambia tu contraseña de acceso al panel.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de pestañas */}
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '10px',
            marginBottom: '20px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setProfileError('');
              setProfileSuccess('');
            }}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'profile' ? '#fff' : 'transparent',
              color: activeTab === 'profile' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'profile' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>👤</span>
            <span>Mis Datos</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('password');
              setPasswordError('');
              setPasswordSuccess('');
            }}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'password' ? '#fff' : 'transparent',
              color: activeTab === 'password' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'password' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>🔒</span>
            <span>Cambiar Clave</span>
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: isSuper ? '#f5f3ff' : '#eff6ff',
                border: `1px solid ${isSuper ? '#ddd6fe' : '#bfdbfe'}`,
                padding: '12px 16px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: isSuper ? '#6d28d9' : '#1d4ed8',
                    letterSpacing: '0.5px',
                  }}
                >
                  Rol en el sistema
                </span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                  {isSuper ? '🛡️ Super Administrador Woodland' : `🏢 Administrador (${sessionUser?.business?.name || 'Mi Negocio'})`}
                </div>
              </div>
              <span
                style={{
                  background: isSuper ? '#7559f2' : '#2563eb',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '12px',
                }}
              >
                {isSuper ? 'SUPERADMIN' : 'ADMIN'}
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Nombre completo *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Francisco Woodland"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Correo electrónico de ingreso *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ejemplo.cl"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                Con este correo iniciarás sesión en el panel administrativo.
              </span>
            </div>

            {profileError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                ⚠️ {profileError}
              </div>
            )}

            {profileSuccess && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                ✓ {profileSuccess}
              </div>
            )}

            <div className="admin-profile-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: savingProfile ? 'not-allowed' : 'pointer',
                  opacity: savingProfile ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {savingProfile ? 'Guardando…' : 'Guardar mis datos'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#92400e',
              }}
            >
              🔒 Para cambiar tu clave, ingresa tu contraseña actual de acceso y luego define la nueva (mínimo 6 caracteres).
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Contraseña actual *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Tu contraseña actual"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#64748b',
                  }}
                >
                  {showCurrent ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Nueva contraseña *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#64748b',
                  }}
                >
                  {showNew ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Confirmar nueva contraseña *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#64748b',
                  }}
                >
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {passwordError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                ⚠️ {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                ✓ {passwordSuccess}
              </div>
            )}

            <div className="admin-profile-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: savingPassword ? 'not-allowed' : 'pointer',
                  opacity: savingPassword ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {savingPassword ? 'Actualizando…' : 'Cambiar contraseña'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [active, setActive] = useState('Resumen');
  const [notice, setNotice] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const today = useMemo(() => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), []);

  const isSuper = Boolean(
    sessionUser?.isSuperAdmin ||
    sessionUser?.role === 'superadmin' ||
    sessionUser?.email?.toLowerCase().trim() === 'admin@agendando.cl' ||
    String(sessionUser?.id) === '1'
  );

  const navItems = useMemo(() => {
    if (isSuper) {
      return [
        { key: 'Perfiles', label: 'Perfiles y Clientes', icon: '👥' },
      ];
    }
    return [
      { key: 'Resumen', label: 'Resumen', icon: '⌂' },
      { key: 'Agenda', label: 'Agenda', icon: '▦' },
      { key: 'Reservas', label: 'Reservas', icon: '◫' },
      { key: 'Asistencia', label: 'Pasar Lista', icon: '📋' },
      { key: 'Alumnos', label: 'Alumnos', icon: '♙' },
      { key: 'Pagos', label: 'Pagos', icon: '💳' },
      { key: 'Servicios', label: 'Servicios', icon: '◇' },
      { key: 'Equipo', label: 'Equipo', icon: '♚' },
    ];
  }, [isSuper]);

  useEffect(() => {
    if (isSuper && active !== 'Perfiles') {
      setActive('Perfiles');
    }
  }, [isSuper, active]);

  function demo(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function checkSession() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch('/api/auth/me', {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json() as { authenticated: boolean; user: SessionUser };
        if (data.authenticated && data.user) {
          setSessionUser(data.user);
          const superCheck = Boolean(
            data.user.isSuperAdmin ||
            data.user.role === 'superadmin' ||
            data.user.email?.toLowerCase().trim() === 'admin@agendando.cl' ||
            String(data.user.id) === '1'
          );
          if (superCheck) {
            setActive('Perfiles');
          }
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
    // Fail-safe: Si la comprobación de sesión demora más de 3 segundos, desbloquear la vista de login
    const safetyTimer = setTimeout(() => {
      setAuthChecking(false);
    }, 3000);

    void checkSession().finally(() => {
      clearTimeout(safetyTimer);
      setAuthChecking(false);
    });

    return () => clearTimeout(safetyTimer);
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
        fontFamily: 'inherit',
        padding: '20px'
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
        <button
          type="button"
          onClick={() => setAuthChecking(false)}
          style={{
            marginTop: '20px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#cbd5e1',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Ir a iniciar sesión
        </button>
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
          {navItems.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setActive(item.key);
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!isSuper && (
            <button
              className={active === 'Configuración' ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setActive('Configuración');
                setMobileMenuOpen(false);
              }}
            >
              ⚙ Configuración
            </button>
          )}
          <div className="profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div
              onClick={() => setProfileModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, cursor: 'pointer', flex: 1, padding: '4px', borderRadius: '8px', transition: 'background 0.15s ease' }}
              title="Haz clic para ver o editar tus datos y clave de ingreso"
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: isSuper ? '#7559f2' : '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                {sessionUser?.name ? sessionUser.name.charAt(0).toUpperCase() : 'A'}
              </span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                  {sessionUser?.name || 'Administrador'}
                </strong>
                <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSuper ? '#7559f2' : '#94a3b8', fontSize: '11px', fontWeight: isSuper ? 600 : 400 }}>
                  {isSuper ? 'SUPER ADMIN' : sessionUser?.email}
                </small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                title="Editar mis datos o cambiar clave"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: '5px 7px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ✏️
              </button>
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
          {isSuper ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                background: '#ede9fe',
                color: '#6d28d9',
                padding: '4px 12px',
                borderRadius: '20px',
                letterSpacing: '0.4px'
              }}>
                🛡️ Panel Super Administrador
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.3px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontSize: '14px',
                  color: '#7559f2'
                }}>
                  🏢
                </span>
                <span>{sessionUser?.business?.name || 'Mi Negocio'}</span>
              </span>
            </div>
          )}
          <div className="top-actions">
            {!isSuper && (
              <button
                className="public-link"
                onClick={() => {
                  const slug = sessionUser?.business?.slug;
                  const url = slug ? `/reservar?negocio=${slug}` : '/reservar';
                  window.open(url, '_blank');
                }}
                title="Ver mi página pública de reservas"
              >
                <span>↗</span>
                <span className="public-link-text-full">Ver mi página</span>
                <span className="public-link-text-short">Mi página</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="Mi Perfil / Cambiar Clave"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#334155',
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
              <span>👤</span>
              <span className="public-link-text-full">Mi Cuenta</span>
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

        {isSuper ? (
          <ProfilesModule demo={demo} />
        ) : active === 'Agenda' ? (
          <AgendaModule demo={demo} />
        ) : active === 'Reservas' ? (
          <BookingsModule demo={demo} />
        ) : active === 'Asistencia' ? (
          <AttendanceModule demo={demo} />
        ) : (active === 'Alumnos' || active === 'Clientes') ? (
          <ClientsModule demo={demo} />
        ) : (active === 'Pagos' || active === 'Cobranzas') ? (
          <PaymentsModule demo={demo} />
        ) : active === 'Servicios' ? (
          <ServicesModule demo={demo} />
        ) : active === 'Equipo' ? (
          <TeamModule demo={demo} />
        ) : active === 'Configuración' ? (
          <SettingsModule demo={demo} sessionUser={sessionUser} onUpdateUser={setSessionUser} />
        ) : (
          <SummaryDashboard setActive={setActive} demo={demo} sessionUser={sessionUser} />
        )}
      </section>

      {/* Barra de navegación inferior fija para móviles */}
      <nav
        className="mobile-bottom-nav"
        aria-label="Navegación móvil"
        style={{ gridTemplateColumns: isSuper ? 'repeat(3, 1fr)' : undefined }}
      >
        {isSuper ? (
          <>
            <button
              type="button"
              className={active === 'Perfiles' ? 'active' : ''}
              onClick={() => setActive('Perfiles')}
            >
              <span className="nav-icon">👥</span>
              <small>Clientes</small>
            </button>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
            >
              <span className="nav-icon">👤</span>
              <small>Mi Cuenta</small>
            </button>
            <button
              type="button"
              onClick={handleLogout}
            >
              <span className="nav-icon">🚪</span>
              <small>Salir</small>
            </button>
          </>
        ) : (
          <>
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
              className={active === 'Asistencia' ? 'active' : ''}
              onClick={() => setActive('Asistencia')}
            >
              <span className="nav-icon">📋</span>
              <small>Lista</small>
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
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="nav-icon">☰</span>
              <small>Menú</small>
            </button>
          </>
        )}
      </nav>

      <AdminProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        sessionUser={sessionUser}
        onUpdateUser={(updated) => setSessionUser(updated)}
        demo={demo}
      />

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
  const [agendaBookingServiceId, setAgendaBookingServiceId] = useState<string>('');
  const [agendaBookingProfessionalId, setAgendaBookingProfessionalId] = useState<string>('');
  const [agendaBookingDate, setAgendaBookingDate] = useState<string>('');
  const [agendaBookingTime, setAgendaBookingTime] = useState<string>('18:00');
  const [agendaBookingSlots, setAgendaBookingSlots] = useState<ParsedSlot[]>([]);

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

  function checkSlotTaken(dateStr: string, timeStr: string, chosenService?: Service, profId?: string): { isTaken: boolean; reason?: string } {
    if (!chosenService || !profId) return { isTaken: false };
    const start = parseChileDateTime(dateStr, timeStr);
    if (Number.isNaN(start.getTime())) return { isTaken: false };
    const startSec = Math.floor(start.getTime() / 1000);
    const endSec = startSec + (chosenService.duration_minutes || 60) * 60;

    const overlapping = savedBookings.filter(b =>
      b.status !== 'cancelled' &&
      String(b.professional_id) === String(profId) &&
      b.starts_at < endSec &&
      b.ends_at > startSec
    );

    if (overlapping.length === 0) return { isTaken: false };

    if (chosenService.class_type === 'individual' || (chosenService.capacity || 1) === 1) {
      const b0 = overlapping[0];
      return { isTaken: true, reason: `Horario tomado (${b0.service_name || 'Clase'})` };
    }

    const hasDiff = overlapping.some(b => String(b.service_id) !== String(chosenService.id));
    if (hasDiff) {
      return { isTaken: true, reason: 'Instructor ocupado con otra clase' };
    }

    const maxCap = chosenService.capacity || 10;
    if (overlapping.length >= maxCap) {
      return { isTaken: true, reason: `Cupos agotados (${overlapping.length}/${maxCap})` };
    }

    return { isTaken: false };
  }

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
    const dStr = localDateKey(new Date(session.starts_at * 1000));
    const tStr = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    setAgendaBookingServiceId(String(session.service_id));
    setAgendaBookingProfessionalId(String(session.professional_id));
    setAgendaBookingDate(dStr);
    setAgendaBookingTime(tStr);
    setAgendaBookingSlots([]);
    setPrefillSession({
      serviceId: String(session.service_id),
      professionalId: String(session.professional_id),
      date: dStr,
      time: tStr
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
      demo(
        status === 'completed' || status === 'attended'
          ? '✓ Asistencia marcada como Presente'
          : status === 'no_show' || status === 'absent'
          ? '✕ Ausencia registrada'
          : 'Estado actualizado'
      );
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
          <button
            className="primary"
            onClick={() => {
              setPrefillSession(null);
              setSelectedStudentId('');
              setAgendaBookingServiceId('');
              setAgendaBookingProfessionalId('');
              setAgendaBookingDate(localDateKey(focusDate));
              setAgendaBookingTime('10:00');
              setAgendaBookingSlots([]);
              setShowNew(true);
            }}
          >
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
                          onClick={() => void updateAttendance(stu.booking_id, 'completed')}
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
                            background: stu.status === 'no_show' || stu.status === 'absent' ? '#ef4444' : '#fef2f2',
                            color: stu.status === 'no_show' || stu.status === 'absent' ? '#ffffff' : '#b91c1c',
                            fontWeight: 600,
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                          onClick={() => void updateAttendance(stu.booking_id, 'no_show')}
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
                <select
                  name="serviceId"
                  required
                  value={agendaBookingServiceId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setAgendaBookingServiceId(sid);
                    const chosen = agendaServices.find(s => String(s.id) === sid);
                    const profId = chosen?.instructor_id
                      ? String(chosen.instructor_id)
                      : (agendaTeam.filter(m => Boolean(m.active))[0]?.id ? String(agendaTeam.filter(m => Boolean(m.active))[0].id) : (agendaTeam[0] ? String(agendaTeam[0].id) : ''));
                    setAgendaBookingProfessionalId(profId);
                    if (chosen?.schedule) {
                      const slots = parseScheduleToSlots(chosen.schedule);
                      setAgendaBookingSlots(slots);
                      // Seleccionar automáticamente el primer horario que NO esté tomado
                      const firstAvailable = slots.find(s => !checkSlotTaken(s.date, s.time, chosen, profId).isTaken);
                      const targetSlot = firstAvailable || slots[0];
                      if (targetSlot) {
                        setAgendaBookingDate(targetSlot.date);
                        setAgendaBookingTime(targetSlot.time);
                      } else {
                        setAgendaBookingDate(localDateKey(new Date()));
                        setAgendaBookingTime('18:00');
                      }
                    } else {
                      setAgendaBookingSlots([]);
                      setAgendaBookingDate(localDateKey(new Date()));
                      setAgendaBookingTime('18:00');
                    }
                  }}
                >
                  <option value="" disabled>Seleccionar clase</option>
                  {agendaServices.map(s => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {s.class_type === 'grupal' ? `👥 Grupal (Cupo max: ${s.capacity || 10})` : '👤 Individual'} {s.instructor_name ? `· 👤 ${s.instructor_name}` : ''} {s.schedule ? `· 🕒 ${s.schedule}` : ''} · ${Number(s.price_clp).toLocaleString('es-CL')}
                    </option>
                  ))}
                </select>
              </label>

              <input type="hidden" name="professionalId" value={agendaBookingProfessionalId} />
              <input type="hidden" name="date" value={agendaBookingDate} />
              <input type="hidden" name="time" value={agendaBookingTime} />

              {agendaBookingServiceId && (() => {
                const chosen = agendaServices.find(s => String(s.id) === String(agendaBookingServiceId));
                const instructor = agendaTeam.find(m => String(m.id) === String(agendaBookingProfessionalId));
                const instructorName = instructor?.name || chosen?.instructor_name || 'Instructor asignado';
                const currentSlotCheck = checkSlotTaken(agendaBookingDate, agendaBookingTime, chosen, agendaBookingProfessionalId);
                const recurringPreview = chosen ? calculateRecurringSessions({
                  serviceName: chosen.name,
                  billingPeriod: chosen.billing_period,
                  schedule: chosen.schedule,
                  startDate: agendaBookingDate || localDateKey(new Date()),
                  startTime: agendaBookingTime || '18:00',
                }) : [];

                return (
                  <div className="full" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                          👤 Instructor: <strong>{instructorName}</strong>
                        </span>
                        {chosen?.schedule && (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            · 🕒 Horario: <strong>{chosen.schedule}</strong>
                          </span>
                        )}
                      </div>
                      <div style={{
                        background: currentSlotCheck.isTaken ? '#fef2f2' : '#eff6ff',
                        color: currentSlotCheck.isTaken ? '#dc2626' : '#1d4ed8',
                        border: currentSlotCheck.isTaken ? '1px solid #fca5a5' : '1px solid #bfdbfe',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        {currentSlotCheck.isTaken ? '⛔' : '📅'} Inicio: {agendaBookingDate} · 🕒 {agendaBookingTime} hrs
                      </div>
                    </div>

                    {currentSlotCheck.isTaken && (
                      <div style={{ background: '#fee2e2', border: '1px solid #f87171', borderRadius: '8px', padding: '8px 12px', margin: '8px 0', color: '#991b1b', fontSize: '12px', fontWeight: 600 }}>
                        ⚠️ Este horario ya se encuentra tomado con {instructorName}. No es posible sobreponer otra clase en el mismo bloque. Por favor selecciona otro día u horario disponible.
                      </div>
                    )}

                    {agendaBookingSlots.length > 0 && (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                          Horarios habituales de esta clase:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {agendaBookingSlots.map((slot, idx) => {
                            const slotStatus = checkSlotTaken(slot.date, slot.time, chosen, agendaBookingProfessionalId);
                            const isSelected = agendaBookingDate === slot.date && agendaBookingTime === slot.time;
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={slotStatus.isTaken}
                                onClick={() => {
                                  if (!slotStatus.isTaken) {
                                    setAgendaBookingDate(slot.date);
                                    setAgendaBookingTime(slot.time);
                                  }
                                }}
                                title={slotStatus.isTaken ? (slotStatus.reason || 'Horario tomado') : 'Horario disponible'}
                                style={{
                                  background: slotStatus.isTaken ? '#f1f5f9' : isSelected ? '#18181b' : '#ffffff',
                                  color: slotStatus.isTaken ? '#94a3b8' : isSelected ? '#ffffff' : '#334155',
                                  border: slotStatus.isTaken ? '1px dashed #cbd5e1' : isSelected ? '1px solid #18181b' : '1px solid #cbd5e1',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: slotStatus.isTaken ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  opacity: slotStatus.isTaken ? 0.65 : 1,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span>{slotStatus.isTaken ? '⛔' : isSelected ? '✓' : '•'}</span>
                                <span>{slot.label} ({slot.date.slice(5)})</span>
                                {slotStatus.isTaken && <small style={{ fontSize: '10px', color: '#ef4444' }}>· Tomado</small>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reasignación de fecha y hora */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '4px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          🗓️ Reasignar Día y Horario para esta inscripción:
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          (Puedes modificar la fecha y la hora libremente)
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Fecha de la sesión:
                          </label>
                          <input
                            type="date"
                            min={todayKey}
                            value={agendaBookingDate}
                            onChange={(e) => setAgendaBookingDate(e.target.value)}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '0 8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              background: '#ffffff',
                              color: '#0f172a'
                            }}
                            required
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Horario de inicio:
                          </label>
                          <select
                            value={agendaBookingTime}
                            onChange={(e) => setAgendaBookingTime(e.target.value)}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '0 8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              background: '#ffffff',
                              color: '#0f172a'
                            }}
                            required
                          >
                            {(() => {
                              const timeList = TIME_OPTIONS.includes(agendaBookingTime) ? TIME_OPTIONS : Array.from(new Set([agendaBookingTime, ...TIME_OPTIONS])).sort();
                              return timeList.map(t => (
                                <option key={`agenda-time-opt-${t}`} value={t}>{t} hrs</option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    </div>

                    {recurringPreview.length > 1 && (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            ✓ Plan completo: Se agendarán las {recurringPreview.length} sesiones automáticamente
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                            Total: {recurringPreview.length} clases
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                          {recurringPreview.map((s, idx) => {
                            const sStatus = checkSlotTaken(s.date, s.time, chosen, agendaBookingProfessionalId);
                            return (
                              <div
                                key={idx}
                                style={{
                                  background: sStatus.isTaken ? '#fef2f2' : '#f0fdf4',
                                  border: sStatus.isTaken ? '1px solid #fecaca' : '1px solid #bbf7d0',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  color: sStatus.isTaken ? '#991b1b' : '#166534',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <strong style={{ fontSize: '10px', background: sStatus.isTaken ? '#fee2e2' : '#dcfce7', borderRadius: '4px', padding: '1px 4px' }}>#{idx + 1}</strong>
                                <span>{s.dayName} {s.date.slice(5)} · {s.time}</span>
                                {sStatus.isTaken && <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '9px', color: '#ef4444' }}>⛔ Tomado</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <label className="full">Notas de la sesión
                <textarea name="notes" rows={2} placeholder="Objetivos para la clase, material requerido o recordatorios (opcional)" />
              </label>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setShowNew(false)}>Cancelar</button>
              <button
                type="submit"
                disabled={
                  saving ||
                  agendaServices.length === 0 ||
                  agendaTeam.length === 0 ||
                  Boolean(agendaBookingServiceId && checkSlotTaken(agendaBookingDate, agendaBookingTime, agendaServices.find(s => String(s.id) === String(agendaBookingServiceId)), agendaBookingProfessionalId).isTaken)
                }
              >
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
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'attended' | 'absent';
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
  const [bookingServiceId, setBookingServiceId] = useState('');
  const [bookingProfessionalId, setBookingProfessionalId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('18:00');
  const [bookingSlots, setBookingSlots] = useState<ParsedSlot[]>([]);
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

    const targetDt = parseChileDateTime(date, time);
    if (!Number.isNaN(targetDt.getTime()) && targetDt.getTime() < Date.now() - 5 * 60 * 1000) {
      setFormError('No se puede seleccionar una fecha u hora pasada.');
      setSaving(false);
      return;
    }

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

  function checkBookingSlotTaken(dateStr: string, timeStr: string, chosenService?: Service, profId?: string): { isTaken: boolean; reason?: string } {
    if (!chosenService || !profId) return { isTaken: false };
    const start = parseChileDateTime(dateStr, timeStr);
    if (Number.isNaN(start.getTime())) return { isTaken: false };
    const startSec = Math.floor(start.getTime() / 1000);
    const endSec = startSec + (chosenService.duration_minutes || 60) * 60;

    const overlapping = bookings.filter(b =>
      b.status !== 'cancelled' &&
      String(b.professional_id) === String(profId) &&
      b.starts_at < endSec &&
      b.ends_at > startSec
    );

    if (overlapping.length === 0) return { isTaken: false };

    if (chosenService.class_type === 'individual' || (chosenService.capacity || 1) === 1) {
      const b0 = overlapping[0];
      return { isTaken: true, reason: `Horario tomado (${b0.service_name || 'Clase'})` };
    }

    const hasDiff = overlapping.some(b => String(b.service_id) !== String(chosenService.id));
    if (hasDiff) {
      return { isTaken: true, reason: 'Instructor ocupado con otra clase' };
    }

    const maxCap = chosenService.capacity || 10;
    if (overlapping.length >= maxCap) {
      return { isTaken: true, reason: `Cupos agotados (${overlapping.length}/${maxCap})` };
    }

    return { isTaken: false };
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

    const bookingDateStr = String(payload.date || bookingDate);
    const bookingTimeStr = String(payload.time || bookingTime);
    const targetDt = parseChileDateTime(bookingDateStr, bookingTimeStr);
    if (!Number.isNaN(targetDt.getTime()) && targetDt.getTime() < Date.now() - 5 * 60 * 1000) {
      setFormError('No se puede agendar una clase en una fecha u hora pasada.');
      setSaving(false);
      return;
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
            setSelectedStudentId('');
            setBookingServiceId('');
            setBookingProfessionalId('');
            setBookingDate(todayKey);
            setBookingTime('18:00');
            setBookingSlots([]);
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
                <select
                  name="serviceId"
                  required
                  value={bookingServiceId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setBookingServiceId(sid);
                    const chosen = services.find(s => String(s.id) === sid);
                    const profId = chosen?.instructor_id
                      ? String(chosen.instructor_id)
                      : (team.filter(m => Boolean(m.active))[0]?.id ? String(team.filter(m => Boolean(m.active))[0].id) : (team[0] ? String(team[0].id) : ''));
                    setBookingProfessionalId(profId);
                    if (chosen?.schedule) {
                      const slots = parseScheduleToSlots(chosen.schedule);
                      setBookingSlots(slots);
                      if (slots.length > 0) {
                        const availableSlot = slots.find(s => !checkBookingSlotTaken(s.date, s.time, chosen, profId).isTaken) || slots[0];
                        setBookingDate(availableSlot.date);
                        setBookingTime(availableSlot.time);
                      } else {
                        setBookingDate(todayKey);
                        setBookingTime('18:00');
                      }
                    } else {
                      setBookingSlots([]);
                      setBookingDate(todayKey);
                      setBookingTime('18:00');
                    }
                  }}
                >
                  <option value="" disabled>Seleccionar clase</option>
                  {services.filter(s => Boolean(s.active)).map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {s.class_type === 'grupal' ? `👥 Grupal (Cupo max: ${s.capacity || 10})` : '👤 Individual'} {s.instructor_name ? `· 👤 ${s.instructor_name}` : ''} {s.schedule ? `· 🕒 ${s.schedule}` : ''} · ${Number(s.price_clp).toLocaleString('es-CL')}
                    </option>
                  ))}
                </select>
              </label>

              <input type="hidden" name="professionalId" value={bookingProfessionalId} />
              <input type="hidden" name="date" value={bookingDate} />
              <input type="hidden" name="time" value={bookingTime} />

              {bookingServiceId && (() => {
                const chosen = services.find(s => String(s.id) === String(bookingServiceId));
                const instructor = team.find(m => String(m.id) === String(bookingProfessionalId));
                const instructorName = instructor?.name || chosen?.instructor_name || 'Instructor asignado';
                const currentSlotCheck = checkBookingSlotTaken(bookingDate, bookingTime, chosen, bookingProfessionalId);
                const recurringPreview = chosen ? calculateRecurringSessions({
                  serviceName: chosen.name,
                  billingPeriod: chosen.billing_period,
                  schedule: chosen.schedule,
                  startDate: bookingDate || todayKey,
                  startTime: bookingTime || '18:00',
                }) : [];

                return (
                  <div className="full" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                          👤 Instructor: <strong>{instructorName}</strong>
                        </span>
                        {chosen?.schedule && (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            · 🕒 Horario: <strong>{chosen.schedule}</strong>
                          </span>
                        )}
                      </div>
                      <div style={{
                        background: currentSlotCheck.isTaken ? '#fef2f2' : '#eff6ff',
                        color: currentSlotCheck.isTaken ? '#dc2626' : '#1d4ed8',
                        border: currentSlotCheck.isTaken ? '1px solid #fca5a5' : '1px solid #bfdbfe',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        {currentSlotCheck.isTaken ? '⛔' : '📅'} Inicio: {bookingDate} · 🕒 {bookingTime} hrs
                      </div>
                    </div>

                    {currentSlotCheck.isTaken && (
                      <div style={{ background: '#fee2e2', border: '1px solid #f87171', borderRadius: '8px', padding: '8px 12px', margin: '8px 0', color: '#991b1b', fontSize: '12px', fontWeight: 600 }}>
                        ⚠️ Este horario ya se encuentra tomado con {instructorName}. No es posible sobreponer otra clase en el mismo bloque. Por favor selecciona otro día u horario disponible.
                      </div>
                    )}

                    {bookingSlots.length > 0 && (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                          Horarios habituales de esta clase:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {bookingSlots.map((slot, idx) => {
                            const slotStatus = checkBookingSlotTaken(slot.date, slot.time, chosen, bookingProfessionalId);
                            const isSelected = bookingDate === slot.date && bookingTime === slot.time;
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={slotStatus.isTaken}
                                onClick={() => {
                                  if (!slotStatus.isTaken) {
                                    setBookingDate(slot.date);
                                    setBookingTime(slot.time);
                                  }
                                }}
                                title={slotStatus.isTaken ? (slotStatus.reason || 'Horario tomado') : 'Horario disponible'}
                                style={{
                                  background: slotStatus.isTaken ? '#f1f5f9' : isSelected ? '#18181b' : '#ffffff',
                                  color: slotStatus.isTaken ? '#94a3b8' : isSelected ? '#ffffff' : '#334155',
                                  border: slotStatus.isTaken ? '1px dashed #cbd5e1' : isSelected ? '1px solid #18181b' : '1px solid #cbd5e1',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: slotStatus.isTaken ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  opacity: slotStatus.isTaken ? 0.65 : 1,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span>{slotStatus.isTaken ? '⛔' : isSelected ? '✓' : '•'}</span>
                                <span>{slot.label} ({slot.date.slice(5)})</span>
                                {slotStatus.isTaken && <small style={{ fontSize: '10px', color: '#ef4444' }}>· Tomado</small>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reasignación de fecha y hora */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '4px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          🗓️ Reasignar Día y Horario para esta inscripción:
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          (Puedes modificar la fecha y la hora libremente)
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Fecha de la sesión:
                          </label>
                          <input
                            type="date"
                            min={todayKey}
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '0 8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              background: '#ffffff',
                              color: '#0f172a'
                            }}
                            required
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Horario de inicio:
                          </label>
                          <select
                            value={bookingTime}
                            onChange={(e) => setBookingTime(e.target.value)}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '0 8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              background: '#ffffff',
                              color: '#0f172a'
                            }}
                            required
                          >
                            {(() => {
                              const timeList = TIME_OPTIONS.includes(bookingTime) ? TIME_OPTIONS : Array.from(new Set([bookingTime, ...TIME_OPTIONS])).sort();
                              return timeList.map(t => (
                                <option key={`booking-time-opt-${t}`} value={t}>{t} hrs</option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    </div>

                    {recurringPreview.length > 1 && (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            ✓ Plan completo: Se agendarán las {recurringPreview.length} sesiones automáticamente
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                            Total: {recurringPreview.length} clases
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                          {recurringPreview.map((s, idx) => {
                            const sStatus = checkBookingSlotTaken(s.date, s.time, chosen, bookingProfessionalId);
                            return (
                              <div
                                key={idx}
                                style={{
                                  background: sStatus.isTaken ? '#fef2f2' : '#f0fdf4',
                                  border: sStatus.isTaken ? '1px solid #fecaca' : '1px solid #bbf7d0',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  color: sStatus.isTaken ? '#991b1b' : '#166534',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <strong style={{ fontSize: '10px', background: sStatus.isTaken ? '#fee2e2' : '#dcfce7', borderRadius: '4px', padding: '1px 4px' }}>#{idx + 1}</strong>
                                <span>{s.dayName} {s.date.slice(5)} · {s.time}</span>
                                {sStatus.isTaken && <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '9px', color: '#ef4444' }}>⛔ Tomado</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <label className="full">Notas de la sesión
                <textarea name="notes" rows={2} placeholder="Observaciones o indicaciones especiales (opcional)" />
              </label>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setShowNew(false)}>Cancelar</button>
              <button
                type="submit"
                disabled={
                  saving ||
                  services.length === 0 ||
                  team.length === 0 ||
                  Boolean(bookingServiceId && checkBookingSlotTaken(bookingDate, bookingTime, services.find(s => String(s.id) === String(bookingServiceId)), bookingProfessionalId).isTaken)
                }
              >
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


function AttendanceModule({ demo }: { demo: (message: string) => void }) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [students, setStudents] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => bookingDateKey(Math.floor(Date.now() / 1000)));
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal para inscribir alumno a la clase en vivo
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedStudentToEnroll, setSelectedStudentToEnroll] = useState('');
  const [savingEnroll, setSavingEnroll] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  async function loadData(showToast = false) {
    try {
      if (showToast) setRefreshing(true);
      const [bookRes, servRes, teamRes, custRes] = await Promise.all([
        fetch('/api/bookings?includeCancelled=0', { cache: 'no-store' }),
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
      if (showToast) demo('Lista actualizada.');
    } catch {
      demo('Error al cargar datos de asistencia.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Agrupar reservas del día y del instructor en sesiones de clase
  const sessions = useMemo(() => {
    const map = new Map<string, {
      key: string;
      serviceId: number;
      serviceName: string;
      professionalId: number;
      professionalName: string;
      professionalColor?: string;
      startsAt: number;
      endsAt: number;
      dateKey: string;
      timeStr: string;
      durationMinutes: number;
      capacity: number;
      classType: string;
      students: {
        bookingId: number;
        customerId: number;
        customerName: string;
        customerEmail: string | null;
        customerPhone: string | null;
        planName: string | null;
        membershipStatus: string | null;
        paymentStatus: string | null;
        status: string;
      }[];
    }>();

    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      const dKey = bookingDateKey(b.starts_at);
      if (dKey !== selectedDate) continue;

      if (selectedInstructorId !== 'all' && String(b.professional_id) !== selectedInstructorId) {
        continue;
      }

      const p = chileDateParts(new Date(b.starts_at * 1000));
      const timeStr = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
      const key = `${b.service_id}_${b.starts_at}_${b.professional_id}`;

      if (!map.has(key)) {
        const duration = Math.max(30, Math.round((b.ends_at - b.starts_at) / 60));
        map.set(key, {
          key,
          serviceId: b.service_id,
          serviceName: b.service_name,
          professionalId: b.professional_id,
          professionalName: b.professional_name,
          professionalColor: b.professional_color,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          dateKey: dKey,
          timeStr,
          durationMinutes: duration,
          capacity: b.capacity || 10,
          classType: b.class_type || 'individual',
          students: []
        });
      }

      map.get(key)!.students.push({
        bookingId: b.id,
        customerId: b.customer_id,
        customerName: b.customer_name,
        customerEmail: b.customer_email,
        customerPhone: b.customer_phone,
        planName: b.plan_name,
        membershipStatus: b.membership_status,
        paymentStatus: b.payment_status,
        status: b.status || 'confirmed'
      });
    }

    const list = Array.from(map.values());
    list.sort((a, b) => a.startsAt - b.startsAt);
    return list;
  }, [bookings, selectedDate, selectedInstructorId]);

  useEffect(() => {
    if (sessions.length > 0) {
      if (!selectedSessionKey || !sessions.some(s => s.key === selectedSessionKey)) {
        setSelectedSessionKey(sessions[0].key);
      }
    } else {
      setSelectedSessionKey(null);
    }
  }, [sessions, selectedSessionKey]);

  const activeSession = useMemo(() => {
    return sessions.find(s => s.key === selectedSessionKey) || null;
  }, [sessions, selectedSessionKey]);

  const stats = useMemo(() => {
    if (!activeSession) return { total: 0, attended: 0, absent: 0, pending: 0, percent: 0 };
    const total = activeSession.students.length;
    const attended = activeSession.students.filter(s => s.status === 'completed' || s.status === 'attended').length;
    const absent = activeSession.students.filter(s => s.status === 'no_show' || s.status === 'absent').length;
    const pending = activeSession.students.filter(s => s.status !== 'completed' && s.status !== 'attended' && s.status !== 'no_show' && s.status !== 'absent').length;
    const percent = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { total, attended, absent, pending, percent };
  }, [activeSession]);

  async function updateStudentAttendance(bookingId: number, status: 'completed' | 'no_show' | 'confirmed', studentName: string) {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bookingId, status })
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Error al actualizar');
      }
      demo(status === 'completed' ? `✓ ${studentName}: Presente` : status === 'no_show' ? `✕ ${studentName}: Ausente` : `• ${studentName}: Pendiente`);
    } catch (e) {
      demo(e instanceof Error ? e.message : 'Error al guardar');
      void loadData();
    }
  }

  async function markAllPresent() {
    if (!activeSession) return;
    const toUpdate = activeSession.students.filter(s => s.status !== 'completed' && s.status !== 'attended');
    if (toUpdate.length === 0) {
      demo('Todos los alumnos ya están marcados como presentes.');
      return;
    }
    setBookings(prev => prev.map(b => {
      if (toUpdate.some(u => u.bookingId === b.id)) {
        return { ...b, status: 'completed' };
      }
      return b;
    }));
    demo(`Marcando ${toUpdate.length} alumnos como presentes…`);
    try {
      await Promise.all(toUpdate.map(u =>
        fetch('/api/bookings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: u.bookingId, status: 'completed' })
        })
      ));
      demo('✓ Toda la clase marcada como presente.');
      await loadData();
    } catch {
      demo('Error al actualizar lista.');
      await loadData();
    }
  }

  async function resetListToPending() {
    if (!activeSession) return;
    if (!confirm('¿Restablecer la asistencia de toda la clase a pendiente?')) return;
    setBookings(prev => prev.map(b => {
      if (activeSession.students.some(u => u.bookingId === b.id)) {
        return { ...b, status: 'confirmed' };
      }
      return b;
    }));
    try {
      await Promise.all(activeSession.students.map(u =>
        fetch('/api/bookings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: u.bookingId, status: 'confirmed' })
        })
      ));
      demo('Lista restablecida.');
      await loadData();
    } catch {
      demo('Error al restablecer.');
      await loadData();
    }
  }

  function handleNotifyAbsent(student: { customerName: string; customerPhone?: string | null }) {
    if (!student.customerPhone) {
      demo(`El alumno ${student.customerName} no tiene teléfono registrado.`);
      return;
    }
    let p = student.customerPhone.replace(/[^\d]/g, '');
    if (p.length === 9 && p.startsWith('9')) p = '56' + p;
    const msg = `Hola ${student.customerName}, te extrañamos hoy en la clase de ${activeSession?.serviceName || 'la clase'} (${activeSession?.timeStr || ''} hrs). Esperamos que todo esté bien, ¡te esperamos en tu próxima sesión!`;
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function handleDateStep(days: number) {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const current = new Date(y, m - 1, d);
    current.setDate(current.getDate() + days);
    const yr = current.getFullYear();
    const mo = String(current.getMonth() + 1).padStart(2, '0');
    const da = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${yr}-${mo}-${da}`);
  }

  async function handleQuickEnroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeSession) return;
    setSavingEnroll(true);
    setEnrollError('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.serviceId = String(activeSession.serviceId);
    payload.professionalId = String(activeSession.professionalId);
    payload.date = activeSession.dateKey;
    payload.time = activeSession.timeStr;

    if (selectedStudentToEnroll && selectedStudentToEnroll !== 'new') {
      const s = students.find(x => String(x.id) === selectedStudentToEnroll);
      if (s) {
        payload.customerId = String(s.id);
        payload.customerName = s.name;
        payload.customerEmail = s.email;
        payload.customerPhone = s.phone || '';
      }
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo inscribir.');
      await loadData();
      setShowEnrollModal(false);
      setSelectedStudentToEnroll('');
      demo('✓ Alumno sumado a la lista.');
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : 'Error al inscribir.');
    } finally {
      setSavingEnroll(false);
    }
  }

  const filteredStudents = useMemo(() => {
    if (!activeSession) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeSession.students;
    return activeSession.students.filter(s =>
      s.customerName.toLowerCase().includes(q) ||
      (s.customerPhone || '').includes(q) ||
      (s.planName || '').toLowerCase().includes(q)
    );
  }, [activeSession, searchQuery]);

  function initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  const todayChileKey = useMemo(() => bookingDateKey(Math.floor(Date.now() / 1000)), []);
  const isToday = selectedDate === todayChileKey;

  const formattedDateTitle = useMemo(() => {
    try {
      const d = new Date(`${selectedDate}T12:00:00`);
      return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  return (
    <div className="bookings-content attendance-content" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Barra de título y filtros principales */}
      <div className="bookings-titlebar" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p className="eyebrow">CONTROL DE ASISTENCIA Y PASAR LISTA</p>
          <h1>Pasar Lista</h1>
          <p>Selecciona tu clase del día para registrar la asistencia de los alumnos en tiempo real.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🔄</span> {refreshing ? 'Actualizando…' : 'Refrescar'}
          </button>
        </div>
      </div>

      {/* Selector de Instructor y Navegador de Fecha */}
      <section style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px'
      }}>
        {/* Selector de Instructor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 280px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
            <span>👤</span> Instructor:
          </label>
          <select
            value={selectedInstructorId}
            onChange={e => setSelectedInstructorId(e.target.value)}
            style={{
              flex: 1,
              height: '40px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              padding: '0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#0f172a',
              background: '#f8fafc'
            }}
          >
            <option value="all">Todos los instructores</option>
            {team.map(m => (
              <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
            ))}
          </select>
        </div>

        {/* Navegador de Fecha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleDateStep(-1)}
            title="Día anterior"
            style={{
              height: '38px',
              padding: '0 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ◀ Ayer
          </button>

          <button
            type="button"
            onClick={() => setSelectedDate(todayChileKey)}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '8px',
              border: isToday ? '1px solid #2563eb' : '1px solid #cbd5e1',
              background: isToday ? '#eff6ff' : '#ffffff',
              color: isToday ? '#1d4ed8' : '#334155',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            📅 Hoy
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              height: '38px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              padding: '0 10px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#0f172a',
              background: '#ffffff'
            }}
          />

          <button
            type="button"
            onClick={() => handleDateStep(1)}
            title="Día siguiente"
            style={{
              height: '38px',
              padding: '0 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Mañana ▶
          </button>
        </div>
      </section>

      {/* Selector de Clases / Sesiones del Día */}
      <section style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Clases de {formattedDateTitle}:
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            {sessions.length} {sessions.length === 1 ? 'clase programada' : 'clases programadas'}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div style={{
            background: '#ffffff',
            border: '1px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '36px 20px',
            textAlign: 'center',
            color: '#64748b'
          }}>
            <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📅</span>
            <strong style={{ fontSize: '16px', color: '#1e293b', display: 'block' }}>
              No hay clases con alumnos inscritos para este día
            </strong>
            <p style={{ margin: '6px 0 16px', fontSize: '13px' }}>
              Puedes cambiar la fecha arriba o pulsar &quot;Hoy&quot; para revisar la lista de asistencia del día.
            </p>
            <button
              type="button"
              onClick={() => setSelectedDate(localDateKey(new Date()))}
              style={{
                background: '#18181b',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Ir a las clases de Hoy
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px'
          }}>
            {sessions.map(s => {
              const isSelected = selectedSessionKey === s.key;
              const attendedCount = s.students.filter(st => st.status === 'completed' || st.status === 'attended').length;
              const totalCount = s.students.length;
              const isFullAttended = totalCount > 0 && attendedCount === totalCount;

              return (
                <div
                  key={s.key}
                  onClick={() => setSelectedSessionKey(s.key)}
                  style={{
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{
                      background: isSelected ? '#2563eb' : '#18181b',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      🕒 {s.timeStr} hrs
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isFullAttended ? '#dcfce7' : attendedCount > 0 ? '#fef3c7' : '#f1f5f9',
                      color: isFullAttended ? '#15803d' : attendedCount > 0 ? '#b45309' : '#475569'
                    }}>
                      {attendedCount > 0 ? `✓ ${attendedCount}/${totalCount} presentes` : '• Sin pasar lista'}
                    </span>
                  </div>

                  <strong style={{ fontSize: '15px', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                    {s.serviceName}
                  </strong>

                  <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>👤 {s.professionalName}</span>
                    <span style={{ fontWeight: 600 }}>👥 {totalCount} {totalCount === 1 ? 'alumno' : 'alumnos'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Detalle y Pase de Lista de la Sesión Activa */}
      {activeSession && (
        <section style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
        }}>
          {/* Header de la Sesión */}
          <div style={{
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '6px'
                }}>
                  🕒 {activeSession.timeStr} hrs ({activeSession.durationMinutes} min)
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  background: '#e2e8f0',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  {activeSession.classType === 'grupal' ? `👥 Grupal (Capacidad: ${activeSession.capacity})` : '👤 Individual'}
                </span>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                {activeSession.serviceName}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                Instructor a cargo: <strong>{activeSession.professionalName}</strong> · Fecha: {formattedDateTitle}
              </p>
            </div>

            {/* Acciones Rápidas */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={markAllPresent}
                disabled={activeSession.students.length === 0}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: activeSession.students.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(22,163,74,0.3)'
                }}
              >
                <span>✓</span> Marcar Todos Presentes
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowEnrollModal(true);
                  setSelectedStudentToEnroll('');
                  setEnrollError('');
                }}
                style={{
                  background: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>＋</span> Sumar Alumno
              </button>

              <button
                type="button"
                onClick={resetListToPending}
                title="Reiniciar estados de asistencia a pendiente"
                style={{
                  background: '#ffffff',
                  color: '#64748b',
                  border: '1px solid #cbd5e1',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Restablecer
              </button>
            </div>
          </div>

          {/* Barra de Estadísticas de Asistencia en vivo */}
          <div style={{
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            padding: '14px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#334155' }}>
                Total Inscritos: <strong style={{ fontSize: '15px' }}>{stats.total}</strong>
              </span>
              <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>
                🟢 Presentes: <strong style={{ fontSize: '15px' }}>{stats.attended}</strong> ({stats.percent}%)
              </span>
              <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>
                🔴 Ausentes: <strong style={{ fontSize: '15px' }}>{stats.absent}</strong>
              </span>
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                ⚪ Pendientes: <strong style={{ fontSize: '15px' }}>{stats.pending}</strong>
              </span>
            </div>

            {/* Buscador de Alumno dentro de la clase */}
            <div style={{ minWidth: '220px' }}>
              <input
                type="text"
                placeholder="🔍 Buscar en la lista…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  padding: '0 10px',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {/* Lista de Alumnos de la Clase */}
          <div style={{ padding: '16px 20px' }}>
            {filteredStudents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <span style={{ fontSize: '28px', display: 'block', marginBottom: '6px' }}>👥</span>
                <strong>{searchQuery ? 'No hay alumnos que coincidan con la búsqueda.' : 'No hay alumnos anotados en esta clase.'}</strong>
                <p style={{ margin: '6px 0 14px', fontSize: '13px' }}>
                  Puedes presionar &quot;＋ Sumar Alumno&quot; para registrar la llegada de un alumno en este momento.
                </p>
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(true)}
                  style={{
                    background: '#18181b',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ＋ Inscribir Alumno a esta clase
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredStudents.map((st, idx) => {
                  const isAttended = st.status === 'completed' || st.status === 'attended';
                  const isAbsent = st.status === 'no_show' || st.status === 'absent';
                  const isPending = !isAttended && !isAbsent;

                  return (
                    <div
                      key={st.bookingId}
                      style={{
                        background: isAttended ? '#f0fdf4' : isAbsent ? '#fef2f2' : '#ffffff',
                        border: isAttended ? '1px solid #bbf7d0' : isAbsent ? '1px solid #fecaca' : '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Datos del Alumno */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px', minWidth: 0 }}>
                        <span style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: isAttended ? '#16a34a' : isAbsent ? '#dc2626' : '#64748b',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                          flexShrink: 0
                        }}>
                          {initials(st.customerName)}
                        </span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                              {idx + 1}. {st.customerName}
                            </strong>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              background: st.membershipStatus === 'active' ? '#dcfce7' : '#fee2e2',
                              color: st.membershipStatus === 'active' ? '#15803d' : '#b91c1c'
                            }}>
                              {st.membershipStatus === 'active' ? '🟢 Al día' : '🔴 Cuota pendiente'}
                            </span>
                          </div>
                          <small style={{ color: '#64748b', display: 'block', marginTop: '2px' }}>
                            {st.planName || 'Plan Regular'} {st.customerPhone ? `· 📞 ${st.customerPhone}` : ''}
                          </small>
                        </div>
                      </div>

                      {/* Botones Grandes de Asistencia (Touch-Friendly para celular) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Botón Presente */}
                        <button
                          type="button"
                          onClick={() => void updateStudentAttendance(st.bookingId, 'completed', st.customerName)}
                          style={{
                            height: '40px',
                            padding: '0 16px',
                            borderRadius: '8px',
                            border: isAttended ? '2px solid #16a34a' : '1px solid #cbd5e1',
                            background: isAttended ? '#16a34a' : '#ffffff',
                            color: isAttended ? '#ffffff' : '#15803d',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isAttended ? '0 2px 6px rgba(22,163,74,0.3)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>✓</span> Presente
                        </button>

                        {/* Botón Ausente */}
                        <button
                          type="button"
                          onClick={() => void updateStudentAttendance(st.bookingId, 'no_show', st.customerName)}
                          style={{
                            height: '40px',
                            padding: '0 16px',
                            borderRadius: '8px',
                            border: isAbsent ? '2px solid #dc2626' : '1px solid #cbd5e1',
                            background: isAbsent ? '#dc2626' : '#ffffff',
                            color: isAbsent ? '#ffffff' : '#b91c1c',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isAbsent ? '0 2px 6px rgba(220,38,38,0.3)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>✕</span> Ausente
                        </button>

                        {/* Botón Pendiente */}
                        <button
                          type="button"
                          onClick={() => void updateStudentAttendance(st.bookingId, 'confirmed', st.customerName)}
                          title="Volver a estado pendiente"
                          style={{
                            height: '40px',
                            padding: '0 12px',
                            borderRadius: '8px',
                            border: isPending ? '2px solid #64748b' : '1px solid #e2e8f0',
                            background: isPending ? '#64748b' : '#f8fafc',
                            color: isPending ? '#ffffff' : '#64748b',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Pendiente
                        </button>

                        {/* Notificación de WhatsApp al alumno */}
                        {st.customerPhone && (
                          <button
                            type="button"
                            onClick={() => handleNotifyAbsent(st)}
                            title={`Enviar mensaje de WhatsApp a ${st.customerName}`}
                            style={{
                              height: '40px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #86efac',
                              background: '#f0fdf4',
                              color: '#16a34a',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>📲</span> WA
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Modal: Inscribir Alumno a la Clase en Vivo */}
      {showEnrollModal && activeSession && (
        <div className="modal-backdrop">
          <form className="new-booking-modal" onSubmit={handleQuickEnroll} style={{ maxWidth: '520px' }}>
            <button type="button" className="close-modal" onClick={() => setShowEnrollModal(false)}>×</button>
            <p className="eyebrow">INSCRIBIR ALUMNO</p>
            <h2>Sumar Alumno a esta Clase</h2>
            <p>
              Clase: <strong>{activeSession.serviceName}</strong> · Horario: <strong>{activeSession.timeStr} hrs</strong>
            </p>

            <div className="form-grid">
              <label className="full">Seleccionar Alumno
                <select
                  value={selectedStudentToEnroll}
                  onChange={e => setSelectedStudentToEnroll(e.target.value)}
                  required
                >
                  <option value="">-- Elige un alumno registrado --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.plan_name || 'Regular'} ({s.phone || 'Sin teléfono'})
                    </option>
                  ))}
                  <option value="new">+ Escribir datos de alumno nuevo</option>
                </select>
              </label>

              {selectedStudentToEnroll === 'new' && (
                <>
                  <label className="full">Nombre completo
                    <input name="customerName" required placeholder="Ej: Marcela Soto" />
                  </label>
                  <label>Teléfono (WhatsApp)
                    <input name="customerPhone" type="tel" placeholder="+56 9 1234 5678" />
                  </label>
                  <label>Correo electrónico
                    <input name="customerEmail" type="email" placeholder="alumno@correo.cl" />
                  </label>
                </>
              )}
            </div>

            {enrollError && <div className="form-error" role="alert">{enrollError}</div>}
            <div className="modal-footer">
              <button type="button" onClick={() => setShowEnrollModal(false)}>Cancelar</button>
              <button type="submit" disabled={savingEnroll}>
                {savingEnroll ? 'Inscribiendo…' : 'Confirmar e Inscribir'}
              </button>
            </div>
          </form>
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
      setPlanNameInput(first.name);
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
    setPlanNameInput(c.plan_name ?? (services[0]?.name || 'Mensualidad Regular'));
    setMonthlyFeeInput(c.monthly_fee ?? (services[0]?.price_clp || 45000));
    setShowNew(true);
  }

  function handleServiceChange(serviceIdVal: string) {
    setSelectedServiceId(serviceIdVal);
    if (serviceIdVal === 'custom') {
      if (!planNameInput) {
        setPlanNameInput('Tarifa Personalizada');
      }
      return;
    }
    const s = services.find(serv => String(serv.id) === serviceIdVal);
    if (s) {
      setPlanNameInput(s.name);
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
    if (editing) payload.id = String(editing.id);

    const s = services.find(serv => String(serv.id) === selectedServiceId);
    if (s) {
      payload.planName = s.name;
      payload.monthlyFee = String(s.price_clp);
    } else {
      if (!payload.planName) payload.planName = planNameInput || 'Mensualidad Regular';
      if (!payload.monthlyFee) payload.monthlyFee = String(monthlyFeeInput || 45000);
    }

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

      <div className="client-stats">
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
                <input name="amount" type="number" required defaultValue={payingStudent.monthly_fee || 35000} step="any" />
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

                <div className="student-contact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
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

                <div className="student-contact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
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
              {selectedServiceId === 'custom' ? (
                <>
                  <label>Nombre de la tarifa / plan
                    <input
                      name="planName"
                      value={planNameInput}
                      onChange={e => setPlanNameInput(e.target.value)}
                      placeholder="Ej: Tarifa personalizada, Beca parcial"
                      required
                    />
                  </label>
                  <label>Valor mensual (CLP)
                    <input
                      name="monthlyFee"
                      type="number"
                      min="0"
                      step="any"
                      value={monthlyFeeInput}
                      onChange={e => setMonthlyFeeInput(e.target.value)}
                      placeholder="45000"
                      required
                    />
                  </label>
                </>
              ) : (
                <>
                  <input type="hidden" name="planName" value={planNameInput} />
                  <input type="hidden" name="monthlyFee" value={monthlyFeeInput} />
                </>
              )}
              <label className={editing ? '' : 'full'}>Día de vencimiento (1 al 31)
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
      <div className="service-stats">
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
                  step="any"
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
                  step="any"
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
  instructor_id?: number | null;
  instructor_name?: string | null;
  duration_minutes: number;
  price_clp: number;
  deposit_percent: number;
  active: number | boolean;
  booking_count: number;
  paid_total: number;
};

function ServicesModule({ demo }: { demo: (message: string) => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'todos' | 'mensuales' | 'anuales' | 'grupales' | 'individuales' | 'pausadas'>('todos');
  const [formClassType, setFormClassType] = useState<'individual' | 'grupal'>('grupal');
  const [formBillingPeriod, setFormBillingPeriod] = useState<'mensual' | 'anual' | 'sesion'>('mensual');
  const [formProfessionalId, setFormProfessionalId] = useState<string>('');
  const DAYS_OF_WEEK = [
    { key: 'Lun', label: 'Lunes' },
    { key: 'Mar', label: 'Martes' },
    { key: 'Mié', label: 'Miércoles' },
    { key: 'Jue', label: 'Jueves' },
    { key: 'Vie', label: 'Viernes' },
    { key: 'Sáb', label: 'Sábado' },
    { key: 'Dom', label: 'Domingo' },
  ];


  const [formDuration, setFormDuration] = useState<number>(60);
  const [formSchedule, setFormSchedule] = useState('');
  const [scheduleSlots, setScheduleSlots] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Lun', 'Mié', 'Vie']);
  const [slotStart, setSlotStart] = useState('18:30');
  const [slotEnd, setSlotEnd] = useState('19:30');
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(0);
  const [scheduleType, setScheduleType] = useState<'same_time' | 'different_times'>('same_time');
  const [perDayTimes, setPerDayTimes] = useState<Record<string, { start: string; end: string }>>({});

  function parseSlotStringToComponents(slotStr: string): { days: string[]; start: string; end: string } {
    const result = {
      days: [] as string[],
      start: '18:30',
      end: '19:30',
    };
    if (!slotStr) return result;

    const timeRangeMatch = slotStr.match(/(\d{1,2}:\d{2})\s*(?:-|a|al|hasta)?\s*(\d{1,2}:\d{2})?/i);
    if (timeRangeMatch) {
      if (timeRangeMatch[1]) {
        const parts = timeRangeMatch[1].split(':');
        result.start = `${parts[0].padStart(2, '0')}:${parts[1]}`;
      }
      if (timeRangeMatch[2]) {
        const parts = timeRangeMatch[2].split(':');
        result.end = `${parts[0].padStart(2, '0')}:${parts[1]}`;
      } else {
        const [h, m] = result.start.split(':').map(Number);
        const endH = (h + 1) % 24;
        result.end = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    const norm = slotStr
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (norm.includes('todos los d') || norm.includes('todos los dias')) {
      result.days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      return result;
    }
    if (norm.includes('lunes a viernes') || norm.includes('lun a vie')) {
      result.days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
      return result;
    }
    if (norm.includes('fines de semana') || norm.includes('fin de semana') || norm.includes('sab y dom') || norm.includes('sáb y dom')) {
      result.days = ['Sáb', 'Dom'];
      return result;
    }

    const detectedDays: string[] = [];
    if (norm.match(/\blun(?:es)?\b/)) detectedDays.push('Lun');
    if (norm.match(/\bmar(?:tes)?\b/)) detectedDays.push('Mar');
    if (norm.match(/\bmie(?:rcoles)?\b/)) detectedDays.push('Mié');
    if (norm.match(/\bjue(?:ves)?\b/)) detectedDays.push('Jue');
    if (norm.match(/\bvie(?:rnes)?\b/)) detectedDays.push('Vie');
    if (norm.match(/\bsab(?:ado|ados)?\b/)) detectedDays.push('Sáb');
    if (norm.match(/\bdom(?:ingo|ingos)?\b/)) detectedDays.push('Dom');

    if (detectedDays.length > 0) {
      result.days = detectedDays;
    }

    return result;
  }

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

  function syncSlotWithSelection(nextDays: string[], nextStart: string, nextEnd: string, targetIdx: number | null = null) {
    if (nextDays.length === 0) return;
    const daysText = formatDaysSummary(nextDays);
    const updatedSlot = `${daysText} ${nextStart} - ${nextEnd}`;

    if (targetIdx !== null && targetIdx >= 0 && targetIdx < scheduleSlots.length) {
      const nextSlots = [...scheduleSlots];
      nextSlots[targetIdx] = updatedSlot;
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    } else if (scheduleSlots.length <= 1) {
      setScheduleSlots([updatedSlot]);
      setFormSchedule(updatedSlot);
    }
  }

  function handleDurationChange(newDuration: number) {
    setFormDuration(newDuration);
    const newEnd = addMinutesToTime(slotStart, newDuration);
    setSlotEnd(newEnd);

    if (scheduleType === 'different_times') {
      const updatedTimes = { ...perDayTimes };
      Object.keys(updatedTimes).forEach(d => {
        updatedTimes[d] = {
          start: updatedTimes[d].start,
          end: addMinutesToTime(updatedTimes[d].start, newDuration)
        };
      });
      setPerDayTimes(updatedTimes);
      const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const sorted = [...selectedDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const nextSlots = sorted.map(d => `${d} ${updatedTimes[d]?.start || slotStart} - ${updatedTimes[d]?.end || newEnd}`);
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    } else {
      syncSlotWithSelection(selectedDays, slotStart, newEnd, editingSlotIndex);
    }
  }

  function handlePerDayStartChange(dayKey: string, nextStart: string) {
    const nextEnd = addMinutesToTime(nextStart, formDuration);
    handlePerDayChange(dayKey, nextStart, nextEnd);
  }

  function handlePerDayChange(dayKey: string, nextStart: string, nextEnd: string) {
    let validEnd = nextEnd;
    if (calculateMinutesBetween(nextStart, nextEnd) <= 0) {
      validEnd = addMinutesToTime(nextStart, formDuration);
    }
    const updated = {
      ...perDayTimes,
      [dayKey]: { start: nextStart, end: validEnd }
    };
    setPerDayTimes(updated);
    const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const sorted = [...selectedDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    const nextSlots = sorted.map(d => {
      const s = updated[d]?.start || slotStart;
      const e = updated[d]?.end || addMinutesToTime(s, formDuration);
      return `${d} ${s} - ${e}`;
    });
    setScheduleSlots(nextSlots);
    setFormSchedule(nextSlots.join(' / '));
  }

  function switchToDifferentTimes(days = selectedDays) {
    setScheduleType('different_times');
    const updatedTimes = { ...perDayTimes };
    days.forEach(d => {
      if (!updatedTimes[d]) {
        updatedTimes[d] = { start: slotStart, end: addMinutesToTime(slotStart, formDuration) };
      } else if (calculateMinutesBetween(updatedTimes[d].start, updatedTimes[d].end) <= 0) {
        updatedTimes[d].end = addMinutesToTime(updatedTimes[d].start, formDuration);
      }
    });
    setPerDayTimes(updatedTimes);
    const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const sorted = [...days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    const nextSlots = sorted.map(d => `${d} ${updatedTimes[d]?.start || slotStart} - ${updatedTimes[d]?.end || addMinutesToTime(slotStart, formDuration)}`);
    setScheduleSlots(nextSlots);
    setFormSchedule(nextSlots.join(' / '));
    setEditingSlotIndex(null);
  }

  function switchToSameTime(days = selectedDays) {
    setScheduleType('same_time');
    const daysText = formatDaysSummary(days);
    const calculatedEnd = addMinutesToTime(slotStart, formDuration);
    setSlotEnd(calculatedEnd);
    const newSlot = `${daysText} ${slotStart} - ${calculatedEnd}`;
    setScheduleSlots([newSlot]);
    setFormSchedule(newSlot);
    setEditingSlotIndex(0);
  }

  function addCurrentSlot() {
    if (selectedDays.length === 0) return;
    const daysText = formatDaysSummary(selectedDays);
    const validEnd = calculateMinutesBetween(slotStart, slotEnd) > 0 ? slotEnd : addMinutesToTime(slotStart, formDuration);
    const newSlot = `${daysText} ${slotStart} - ${validEnd}`;
    if (editingSlotIndex !== null && editingSlotIndex >= 0 && editingSlotIndex < scheduleSlots.length) {
      const nextSlots = [...scheduleSlots];
      nextSlots[editingSlotIndex] = newSlot;
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
      setEditingSlotIndex(null);
    } else {
      if (!scheduleSlots.includes(newSlot)) {
        const nextSlots = [...scheduleSlots, newSlot];
        setScheduleSlots(nextSlots);
        setFormSchedule(nextSlots.join(' / '));
      }
    }
  }

  function removeSlot(index: number) {
    const nextSlots = scheduleSlots.filter((_, i) => i !== index);
    setScheduleSlots(nextSlots);
    setFormSchedule(nextSlots.join(' / '));
    if (editingSlotIndex === index) setEditingSlotIndex(null);
  }

  function toggleDay(dayKey: string) {
    const nextDays = selectedDays.includes(dayKey)
      ? selectedDays.filter(d => d !== dayKey)
      : [...selectedDays, dayKey];
    setSelectedDays(nextDays);
    if (scheduleType === 'different_times') {
      const updatedTimes = { ...perDayTimes };
      if (!updatedTimes[dayKey]) {
        updatedTimes[dayKey] = { start: slotStart, end: addMinutesToTime(slotStart, formDuration) };
      }
      setPerDayTimes(updatedTimes);
      const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const sorted = [...nextDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const nextSlots = sorted.map(d => `${d} ${updatedTimes[d]?.start || slotStart} - ${updatedTimes[d]?.end || addMinutesToTime(slotStart, formDuration)}`);
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    } else {
      syncSlotWithSelection(nextDays, slotStart, slotEnd, editingSlotIndex);
    }
  }

  function handleSelectGroup(days: string[]) {
    setSelectedDays(days);
    if (scheduleType === 'different_times') {
      const updatedTimes = { ...perDayTimes };
      days.forEach(d => {
        if (!updatedTimes[d]) updatedTimes[d] = { start: slotStart, end: addMinutesToTime(slotStart, formDuration) };
      });
      setPerDayTimes(updatedTimes);
      const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const sorted = [...days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const nextSlots = sorted.map(d => `${d} ${updatedTimes[d]?.start || slotStart} - ${updatedTimes[d]?.end || addMinutesToTime(slotStart, formDuration)}`);
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    } else {
      syncSlotWithSelection(days, slotStart, slotEnd, editingSlotIndex);
    }
  }

  function handleStartChange(newStart: string) {
    setSlotStart(newStart);
    const newEnd = addMinutesToTime(newStart, formDuration);
    setSlotEnd(newEnd);
    syncSlotWithSelection(selectedDays, newStart, newEnd, editingSlotIndex);
  }

  function handleEndChange(newEnd: string) {
    if (calculateMinutesBetween(slotStart, newEnd) <= 0) return;
    setSlotEnd(newEnd);
    syncSlotWithSelection(selectedDays, slotStart, newEnd, editingSlotIndex);
  }

  function addPreset(presetText: string) {
    if (!scheduleSlots.includes(presetText)) {
      const nextSlots = [...scheduleSlots, presetText];
      setScheduleSlots(nextSlots);
      setFormSchedule(nextSlots.join(' / '));
    }
    const comp = parseSlotStringToComponents(presetText);
    if (comp.days.length > 0) setSelectedDays(comp.days);
    if (comp.start) setSlotStart(comp.start);
    if (comp.end && calculateMinutesBetween(comp.start, comp.end) > 0) {
      setSlotEnd(comp.end);
    } else if (comp.start) {
      setSlotEnd(addMinutesToTime(comp.start, formDuration));
    }
    setEditingSlotIndex(null);
  }

  function openNewService() {
    setEditing(null);
    setFormDuration(60);
    const defaultProf = team.filter(m => Boolean(m.active))[0]?.id ? String(team.filter(m => Boolean(m.active))[0].id) : (team[0] ? String(team[0].id) : '');
    setFormProfessionalId(defaultProf);
    const defaultSlot = 'Lun, Mié y Vie 18:30 - 19:30';
    setFormSchedule(defaultSlot);
    setScheduleSlots([defaultSlot]);
    setSelectedDays(['Lun', 'Mié', 'Vie']);
    setSlotStart('18:30');
    setSlotEnd('19:30');
    setEditingSlotIndex(0);
    setScheduleType('same_time');
    setPerDayTimes({});
    setShowForm(true);
    setError('');
  }

  function openEditService(s: Service) {
    setEditing(s);
    const sDuration = s.duration_minutes || 60;
    setFormDuration(sDuration);
    setFormClassType(s.class_type || 'grupal');
    setFormBillingPeriod(s.billing_period || 'mensual');
    const foundByName = team.find(m => m.name.toLowerCase() === (s.instructor_name || '').toLowerCase());
    const profId = s.instructor_id ? String(s.instructor_id) : (foundByName ? String(foundByName.id) : '');
    setFormProfessionalId(profId);
    const rawSched = s.schedule || '';
    setFormSchedule(rawSched);
    const parsed = rawSched ? splitScheduleString(rawSched) : [];
    setScheduleSlots(parsed);

    if (parsed.length > 1) {
      const detectedDays: string[] = [];
      const detectedTimes: Record<string, { start: string; end: string }> = {};
      let hasDistinctTimes = false;
      let firstStart = '';

      parsed.forEach(p => {
        const comp = parseSlotStringToComponents(p);
        let validEnd = comp.end;
        if (calculateMinutesBetween(comp.start, comp.end) <= 0) {
          validEnd = addMinutesToTime(comp.start, sDuration);
        }
        comp.days.forEach(d => {
          if (!detectedDays.includes(d)) detectedDays.push(d);
          detectedTimes[d] = { start: comp.start, end: validEnd };
          if (!firstStart) firstStart = comp.start;
          else if (firstStart !== comp.start) hasDistinctTimes = true;
        });
      });

      if (detectedDays.length > 0) setSelectedDays(detectedDays);
      setPerDayTimes(detectedTimes);
      if (hasDistinctTimes || parsed.length > 1) {
        setScheduleType('different_times');
      } else {
        setScheduleType('same_time');
      }
      setEditingSlotIndex(null);
    } else {
      setScheduleType('same_time');
      setPerDayTimes({});
      setEditingSlotIndex(parsed.length > 0 ? 0 : null);
      const slotToParse = parsed.length > 0 ? parsed[0] : rawSched;
      if (slotToParse) {
        const comp = parseSlotStringToComponents(slotToParse);
        if (comp.days.length > 0) setSelectedDays(comp.days);
        else setSelectedDays(['Lun', 'Mié', 'Vie']);
        if (comp.start) setSlotStart(comp.start);
        if (comp.end && calculateMinutesBetween(comp.start, comp.end) > 0) {
          setSlotEnd(comp.end);
        } else if (comp.start) {
          setSlotEnd(addMinutesToTime(comp.start, sDuration));
        }
      } else {
        setSelectedDays(['Lun', 'Mié', 'Vie']);
        setSlotStart('18:30');
        setSlotEnd(addMinutesToTime('18:30', sDuration));
      }
    }

    setShowForm(true);
    setError('');
  }

  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [hasUpcomingBookings, setHasUpcomingBookings] = useState(false);

  async function loadServices() {
    try {
      const [servRes, teamRes] = await Promise.all([
        fetch('/api/services', { cache: 'no-store' }),
        fetch('/api/team', { cache: 'no-store' })
      ]);
      if (servRes.ok) {
        const data = await servRes.json() as { services: Service[] };
        setServices(data.services || []);
      }
      if (teamRes.ok) {
        const data = await teamRes.json() as { team: TeamMember[] };
        setTeam(data.team?.filter(m => Boolean(m.active)) || []);
      }
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
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(form.entries());
    if (editing) payload.id = String(editing.id);

    // Si el usuario configuró días y horas pero no presionó "Agregar a este horario" ni escribió texto manual,
    // o si formSchedule está definido, aseguramos que schedule se guarde con el horario correspondiente.
    let finalSchedule = formSchedule.trim();
    if (!finalSchedule && scheduleSlots.length > 0) {
      finalSchedule = scheduleSlots.join(' / ');
    } else if (!finalSchedule && selectedDays.length > 0) {
      if (scheduleType === 'different_times') {
        const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const sorted = [...selectedDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
        finalSchedule = sorted.map(d => `${d} ${perDayTimes[d]?.start || slotStart} - ${perDayTimes[d]?.end || slotEnd}`).join(' / ');
      } else {
        const daysText = formatDaysSummary(selectedDays);
        finalSchedule = `${daysText} ${slotStart} - ${slotEnd}`;
      }
    }
    // Validar que cada bloque no tenga horas hacia atrás y que coincida con la duración de la clase
    if (finalSchedule) {
      const slotsToCheck = splitScheduleString(finalSchedule);
      for (const slot of slotsToCheck) {
        const comp = parseSlotStringToComponents(slot);
        if (comp.start && comp.end) {
          const diff = calculateMinutesBetween(comp.start, comp.end);
          if (diff <= 0) {
            setError(`Error en horario "${slot}": La hora de término (${comp.end}) no puede ser anterior o igual a la hora de inicio (${comp.start}).`);
            setSaving(false);
            return;
          }
          if (diff !== formDuration) {
            setError(`Error en bloque "${slot}": Dura ${diff} minutos, pero la clase está configurada para ${formDuration} minutos. El bloque debe coincidir con la duración de la clase.`);
            setSaving(false);
            return;
          }
        }
      }
    }

    payload.schedule = finalSchedule || null;

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
                {s.instructor_name && (
                  <div style={{
                    margin: '6px 0 4px',
                    padding: '4px 10px',
                    background: '#faf5ff',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#6b21a8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid #f3e8ff',
                    fontWeight: 600,
                  }}>
                    <span>👤</span>
                    <span>Instructor: <strong>{s.instructor_name}</strong></span>
                  </div>
                )}
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
          <form className="new-booking-modal service-form" key={editing ? `service-edit-${editing.id}` : 'service-new'} onSubmit={save}>
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
                <select
                  name="durationMinutes"
                  value={formDuration}
                  onChange={e => handleDurationChange(Number(e.target.value))}
                >
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
                  step="any"
                  required
                  defaultValue={editing?.price_clp ?? (formBillingPeriod === 'anual' ? 350000 : 35000)}
                />
              </label>

              <label>Instructor / Quién hace la clase
                <select
                  name="professionalId"
                  value={formProfessionalId}
                  onChange={e => setFormProfessionalId(e.target.value)}
                >
                  <option value="">-- Sin instructor fijo asignado --</option>
                  {team.map(m => (
                    <option value={m.id} key={m.id}>
                      {m.name} · {m.role}
                    </option>
                  ))}
                </select>
                {formProfessionalId && (() => {
                  const currentInstructor = team.find(m => String(m.id) === String(formProfessionalId));
                  return currentInstructor ? (
                    <small style={{ color: '#2563eb', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                      👤 A cargo: <strong>{currentInstructor.name}</strong> ({currentInstructor.role})
                    </small>
                  ) : null;
                })()}
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
                        onClick={() => handleSelectGroup(group.days)}
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

                {/* Modalidad de horario: Mismo horario vs Horarios distintos por día */}
                {selectedDays.length > 1 && (
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      🕒 Modalidad de horario para los {selectedDays.length} días seleccionados:
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => switchToSameTime()}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: scheduleType === 'same_time' ? '#1e293b' : '#ffffff',
                          color: scheduleType === 'same_time' ? '#ffffff' : '#475569',
                          border: scheduleType === 'same_time' ? '1px solid #1e293b' : '1px solid #cbd5e1',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {scheduleType === 'same_time' ? '✓ ' : ''}Mismo horario todos los días
                      </button>
                      <button
                        type="button"
                        onClick={() => switchToDifferentTimes()}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: scheduleType === 'different_times' ? '#2563eb' : '#ffffff',
                          color: scheduleType === 'different_times' ? '#ffffff' : '#2563eb',
                          border: scheduleType === 'different_times' ? '1px solid #2563eb' : '1px solid #93c5fd',
                          boxShadow: scheduleType === 'different_times' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {scheduleType === 'different_times' ? '✓ ' : '＋ '}Horarios distintos por día (ej: Lunes 15:00 y Miércoles 17:00)
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Rango de Horas y Botón Agregar */}
                {scheduleType === 'different_times' && selectedDays.length > 1 ? (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>
                        2. Configura el horario específico para cada día:
                      </span>
                      <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '1px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {selectedDays.length} días configurados
                      </span>
                    </div>
                    {selectedDays.map(dayKey => {
                      const dayName = DAYS_OF_WEEK.find(d => d.key === dayKey)?.label || dayKey;
                      const dayStart = perDayTimes[dayKey]?.start || slotStart;
                      const dayEnd = perDayTimes[dayKey]?.end || slotEnd;
                      return (
                        <div key={`per-day-${dayKey}`} style={{ background: '#ffffff', border: '1px solid #e0f2fe', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                            <span style={{ fontSize: '16px' }}>🗓️</span>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>{dayName}</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '2px' }}>Hora Inicio</label>
                              <select
                                value={dayStart}
                                onChange={e => handlePerDayStartChange(dayKey, e.target.value)}
                                style={{ height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, background: '#ffffff', color: '#0f172a' }}
                              >
                                {TIME_OPTIONS.slice(0, -1).map(t => (
                                  <option key={`pds-${t}`} value={t}>{t} hrs</option>
                                ))}
                              </select>
                            </div>
                            <span style={{ alignSelf: 'flex-end', paddingBottom: '8px', color: '#94a3b8', fontWeight: 700 }}>a</span>
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '2px' }}>Hora Término ({formDuration} min)</label>
                              <select
                                value={dayEnd}
                                onChange={e => handlePerDayChange(dayKey, dayStart, e.target.value)}
                                style={{ height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, background: '#ffffff', color: '#0f172a' }}
                              >
                                {(() => {
                                  const validOptions = TIME_OPTIONS.filter(t => t > dayStart);
                                  const expectedEnd = addMinutesToTime(dayStart, formDuration);
                                  const list = validOptions.includes(expectedEnd) ? validOptions : Array.from(new Set([...validOptions, expectedEnd])).sort();
                                  return list.map(t => (
                                    <option key={`pde-${t}`} value={t}>{t} hrs {t === expectedEnd ? `(${formDuration} min)` : ''}</option>
                                  ));
                                })()}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        2. Rango de hora del bloque:
                      </span>
                      {editingSlotIndex !== null && scheduleSlots.length > 1 && (
                        <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '1px 7px', borderRadius: '6px', fontWeight: 600 }}>
                          Editando bloque #{editingSlotIndex + 1}
                        </span>
                      )}
                    </div>
                    <div className="schedule-time-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 110px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                          Hora Inicio
                        </label>
                        <select
                          value={slotStart}
                          onChange={e => handleStartChange(e.target.value)}
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
                          {(() => {
                            const list = TIME_OPTIONS.includes(slotStart) ? TIME_OPTIONS.slice(0, -1) : Array.from(new Set([slotStart, ...TIME_OPTIONS.slice(0, -1)])).sort();
                            return list.map(t => (
                              <option key={`start-${t}`} value={t}>{t} hrs</option>
                            ));
                          })()}
                        </select>
                      </div>

                      <div style={{ flex: '1 1 110px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                          Hora Término ({formDuration} min)
                        </label>
                        <select
                          value={slotEnd}
                          onChange={e => handleEndChange(e.target.value)}
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
                          {(() => {
                            const validOptions = TIME_OPTIONS.filter(t => t > slotStart);
                            const expectedEnd = addMinutesToTime(slotStart, formDuration);
                            const list = validOptions.includes(expectedEnd) ? validOptions : Array.from(new Set([...validOptions, expectedEnd])).sort();
                            return list.map(t => (
                              <option key={`end-${t}`} value={t}>{t} hrs {t === expectedEnd ? `(${formDuration} min)` : ''}</option>
                            ));
                          })()}
                        </select>
                      </div>

                      <button
                        type="button"
                        className="schedule-add-btn"
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
                        <span>{editingSlotIndex !== null && scheduleSlots.length > 1 ? '✓' : '＋'}</span>
                        {editingSlotIndex !== null && scheduleSlots.length > 1 ? 'Actualizar bloque' : 'Agregar bloque a horario'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Bloques asignados */}
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    Bloques configurados para esta clase (haz clic para editar días u hora):
                  </span>
                  {scheduleSlots.length === 0 ? (
                    <div style={{ padding: '12px', background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
                      No has agregado bloques aún. Elige los días y horas arriba y presiona &quot;＋ Agregar bloque a horario&quot;.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {scheduleSlots.map((slot, idx) => {
                        const isCurrentEditing = editingSlotIndex === idx;
                        return (
                          <div
                            key={`slot-${idx}`}
                            onClick={() => {
                              setEditingSlotIndex(idx);
                              const comp = parseSlotStringToComponents(slot);
                              if (comp.days.length > 0) setSelectedDays(comp.days);
                              if (comp.start) setSlotStart(comp.start);
                              if (comp.end) setSlotEnd(comp.end);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isCurrentEditing ? '#eff6ff' : '#ffffff',
                              border: isCurrentEditing ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            title="Haz clic para seleccionar y editar este bloque"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '15px' }}>{isCurrentEditing ? '✓' : '🕒'}</span>
                              <strong style={{ fontSize: '13px', color: isCurrentEditing ? '#1d4ed8' : '#0f172a' }}>{slot}</strong>
                              {isCurrentEditing && (
                                <span style={{ fontSize: '10px', background: '#2563eb', color: '#ffffff', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                  Seleccionado
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSlot(idx);
                                }}
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
                          </div>
                        );
                      })}
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

function SettingsModule({
  demo,
  sessionUser,
  onUpdateUser,
}: {
  demo: (message: string) => void;
  sessionUser?: SessionUser | null;
  onUpdateUser?: (user: SessionUser) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Admin Profile state
  const [adminName, setAdminName] = useState(sessionUser?.name || '');
  const [adminEmail, setAdminEmail] = useState(sessionUser?.email || '');
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    if (sessionUser) {
      setAdminName(sessionUser.name || '');
      setAdminEmail(sessionUser.email || '');
    }
  }, [sessionUser]);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: any) => setSettings(d.settings as Settings))
      .catch(() => demo('No fue posible cargar la configuración.'));
  }, []);

  async function saveBusiness(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.error);
      demo(d.message ?? 'Configuración del negocio guardada.');
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAdminProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingAdmin(true);
    setAdminError('');
    setAdminSuccess('');
    try {
      const r = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', name: adminName, email: adminEmail }),
      });
      const d = (await r.json()) as { error?: string; message?: string; user?: SessionUser };
      if (!r.ok) throw new Error(d.error || 'Error al actualizar datos de administrador.');
      if (d.user && onUpdateUser) onUpdateUser(d.user);
      setAdminSuccess(d.message || 'Datos de administrador actualizados exitosamente.');
      demo(d.message || 'Datos actualizados.');
    } catch (x: any) {
      setAdminError(x?.message || 'No se pudo actualizar.');
    } finally {
      setSavingAdmin(false);
    }
  }

  async function saveAdminPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.');
      setSavingPassword(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('La confirmación de la contraseña no coincide.');
      setSavingPassword(false);
      return;
    }

    try {
      const r = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', currentPassword, newPassword, confirmPassword }),
      });
      const d = (await r.json()) as { error?: string; message?: string; user?: SessionUser };
      if (!r.ok) throw new Error(d.error || 'Error al cambiar la contraseña.');
      if (d.user && onUpdateUser) onUpdateUser(d.user);
      setPasswordSuccess(d.message || 'Contraseña de ingreso actualizada exitosamente.');
      demo(d.message || 'Contraseña actualizada.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (x: any) {
      setPasswordError(x?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="settings-content">
      <div className="settings-title">
        <p className="eyebrow">ADMINISTRACIÓN</p>
        <h1>Configuración y Perfil</h1>
        <p>Define la identidad del negocio, las reglas de reserva y tus credenciales de acceso administrativo.</p>
      </div>

      {!settings ? (
        <div className="settings-loading">Cargando configuración…</div>
      ) : (
        <div style={{ display: 'grid', gap: '28px' }}>
          {/* Bloque 1: Configuración del Negocio y Reglas de Reserva */}
          <form className="settings-form" onSubmit={saveBusiness}>
            <section>
              <header>
                <span>01</span>
                <div>
                  <h2>Información del negocio</h2>
                  <p>Estos datos aparecerán en tu página pública.</p>
                </div>
              </header>
              <div className="form-grid">
                <label className="full">
                  Nombre del negocio
                  <input name="name" required defaultValue={settings.name} />
                </label>
                <label>
                  Correo de contacto público
                  <input name="email" type="email" defaultValue={settings.email ?? ''} />
                </label>
                <label>
                  Teléfono
                  <input name="phone" defaultValue={settings.phone ?? ''} />
                </label>
                <label className="full">
                  Dirección
                  <input name="address" defaultValue={settings.address ?? ''} />
                </label>
                <label className="full">
                  Descripción
                  <textarea name="description" rows={4} defaultValue={settings.description ?? ''} />
                </label>
              </div>
            </section>

            <section>
              <header>
                <span>02</span>
                <div>
                  <h2>Reglas de reserva</h2>
                  <p>Controla anticipación, cancelaciones y moneda.</p>
                </div>
              </header>
              <div className="form-grid">
                <label>
                  Zona horaria
                  <select name="timezone" defaultValue={settings.timezone}>
                    <option value="America/Santiago">Santiago</option>
                    <option value="America/Bogota">Bogotá</option>
                    <option value="America/Mexico_City">Ciudad de México</option>
                    <option value="Europe/Madrid">Madrid</option>
                  </select>
                </label>
                <label>
                  Moneda
                  <select name="currency" defaultValue={settings.currency}>
                    <option>CLP</option>
                    <option>USD</option>
                    <option>EUR</option>
                  </select>
                </label>
                <label>
                  Cancelación mínima (horas)
                  <input name="cancellationHours" type="number" min="0" defaultValue={settings.cancellation_hours} />
                </label>
                <label>
                  Ventana de reserva (días)
                  <input name="bookingWindowDays" type="number" min="1" max="365" defaultValue={settings.booking_window_days} />
                </label>
              </div>
            </section>

            {error && <div className="form-error">{error}</div>}

            <footer>
              <a href="/reservar" target="_blank">↗ Ver página pública</a>
              <button className="primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar información del negocio'}
              </button>
            </footer>
          </form>

          {/* Bloque 2: Datos de Administrador */}
          <form className="settings-form" onSubmit={saveAdminProfile}>
            <section>
              <header>
                <span>03</span>
                <div>
                  <h2>Datos de tu cuenta de Administrador</h2>
                  <p>Modifica el nombre y correo con los que inicias sesión en este panel.</p>
                </div>
              </header>
              <div className="form-grid">
                <label className="full">
                  Nombre del Administrador *
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Ej. Francisco Woodland"
                  />
                </label>
                <label className="full">
                  Correo electrónico de acceso (Login) *
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@ejemplo.cl"
                  />
                  <small style={{ color: '#64748b', marginTop: '4px', display: 'block', fontSize: '12px' }}>
                    Con este correo ingresarás al sistema administrativo.
                  </small>
                </label>
              </div>

              {adminError && <div className="form-error" style={{ marginTop: '14px' }}>⚠️ {adminError}</div>}
              {adminSuccess && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '14px' }}>
                  ✓ {adminSuccess}
                </div>
              )}

              <footer style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="primary" type="submit" disabled={savingAdmin}>
                  {savingAdmin ? 'Guardando datos…' : 'Actualizar mis datos de administrador'}
                </button>
              </footer>
            </section>
          </form>

          {/* Bloque 3: Seguridad y Cambio de Clave */}
          <form className="settings-form" onSubmit={saveAdminPassword}>
            <section>
              <header>
                <span>04</span>
                <div>
                  <h2>Seguridad y Cambio de Clave de Ingreso</h2>
                  <p>Actualiza la contraseña con la que ingresas al panel de administración.</p>
                </div>
              </header>

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '12px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
                🔒 Ingresa tu contraseña actual para confirmar tu identidad antes de establecer la nueva clave (mínimo 6 caracteres).
              </div>

              <div className="form-grid">
                <label className="full">
                  Contraseña actual *
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Tu contraseña actual"
                      style={{ width: '100%', paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
                    >
                      {showCurrent ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>

                <label>
                  Nueva contraseña *
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNew ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      style={{ width: '100%', paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
                    >
                      {showNew ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>

                <label>
                  Confirmar nueva contraseña *
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite la nueva contraseña"
                      style={{ width: '100%', paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
                    >
                      {showConfirm ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>
              </div>

              {passwordError && <div className="form-error" style={{ marginTop: '14px' }}>⚠️ {passwordError}</div>}
              {passwordSuccess && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '14px' }}>
                  ✓ {passwordSuccess}
                </div>
              )}

              <footer style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="primary" type="submit" disabled={savingPassword}>
                  {savingPassword ? 'Cambiando clave…' : 'Cambiar contraseña de ingreso'}
                </button>
              </footer>
            </section>
          </form>
        </div>
      )}
    </div>
  );
}

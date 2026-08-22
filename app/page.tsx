'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const appointments = [
  { time: '09:00', name: 'Camila Soto', service: 'Evaluación inicial', pro: 'Sofía', color: '#7559f2' },
  { time: '10:30', name: 'Tomás Silva', service: 'Sesión de seguimiento', pro: 'Martín', color: '#ff8f6b' },
  { time: '12:00', name: 'Daniela Rojas', service: 'Consulta online', pro: 'Sofía', color: '#30b995' },
  { time: '15:30', name: 'Ignacio Pérez', service: 'Evaluación inicial', pro: 'Martín', color: '#f5b63b' },
];

const nav = ['Resumen', 'Agenda', 'Reservas', 'Clientes', 'Servicios', 'Equipo'];

const weekDays = [
  { day: 'Lun', date: 24 }, { day: 'Mar', date: 25 }, { day: 'Mié', date: 26 },
  { day: 'Jue', date: 27, today: true }, { day: 'Vie', date: 28 }, { day: 'Sáb', date: 29 },
];

const calendarBookings = [
  { id: 1, day: 0, start: 9, span: 1.5, name: 'Camila Soto', service: 'Evaluación inicial', pro: 'Sofía', color: 'purple-event', paid: true },
  { id: 2, day: 0, start: 13, span: 1, name: 'Valentina Mora', service: 'Consulta online', pro: 'Martín', color: 'mint-event', paid: true },
  { id: 3, day: 1, start: 10.5, span: 1, name: 'Tomás Silva', service: 'Seguimiento', pro: 'Martín', color: 'coral-event', paid: false },
  { id: 4, day: 2, start: 15, span: 1.5, name: 'Paula Torres', service: 'Evaluación inicial', pro: 'Sofía', color: 'purple-event', paid: true },
  { id: 5, day: 3, start: 9, span: 1, name: 'Daniela Rojas', service: 'Consulta online', pro: 'Sofía', color: 'mint-event', paid: true },
  { id: 6, day: 3, start: 12, span: 1, name: 'Ignacio Pérez', service: 'Seguimiento', pro: 'Martín', color: 'coral-event', paid: false },
  { id: 7, day: 3, start: 15.5, span: 1, name: 'Martina León', service: 'Evaluación inicial', pro: 'Sofía', color: 'purple-event', paid: true },
  { id: 8, day: 4, start: 11, span: 1, name: 'Javier Muñoz', service: 'Consulta online', pro: 'Martín', color: 'mint-event', paid: true },
  { id: 9, day: 5, start: 10, span: 1.5, name: 'Antonia Vidal', service: 'Evaluación inicial', pro: 'Sofía', color: 'purple-event', paid: false },
];

export default function Home() {
  const [active, setActive] = useState('Resumen');
  const [notice, setNotice] = useState('');
  const today = useMemo(() => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), []);

  function demo(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Nexo Agenda, inicio">
          <span className="brand-mark"><i /><i /><i /></span><span>Nexo</span>
        </a>
        <nav aria-label="Navegación principal">
          {nav.map((item, index) => (
            <button key={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item); if (!['Resumen','Agenda'].includes(item)) demo(`${item}: módulo listo para conectar`); }}>
              <span className="nav-icon" aria-hidden="true">{['⌂','▦','◫','♙','◇','♚'][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => demo('Configuración del negocio')}>⚙ Configuración</button>
          <div className="profile"><span>FV</span><div><strong>Francisco</strong><small>Administrador</small></div><b>···</b></div>
        </div>
      </aside>

      <section className="workspace" id="top">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menú">☰</button>
          <div className="search"><span>⌕</span><input aria-label="Buscar" placeholder="Buscar clientes o reservas..." /><kbd>⌘ K</kbd></div>
          <div className="top-actions"><button aria-label="Notificaciones">♢<em>3</em></button><button className="public-link" onClick={() => window.location.assign('/reservar')}>↗ Ver mi página</button></div>
        </header>

        {active === 'Agenda' ? <AgendaModule demo={demo} /> : <div className="content">
          <div className="welcome-row">
            <div><p className="eyebrow">{today}</p><h1>Buenos días, Francisco</h1><p>Tu negocio está en orden. Tienes 4 reservas para hoy.</p></div>
            <button className="primary" onClick={() => demo('Nueva reserva iniciada')}><span>＋</span> Nueva reserva</button>
          </div>

          <div className="stats-grid">
            <article className="stat-card"><div><span className="stat-icon purple">▣</span><span className="trend up">↗ 12%</span></div><p>Reservas este mes</p><strong>128</strong><small>14 más que el mes pasado</small></article>
            <article className="stat-card"><div><span className="stat-icon coral">$</span><span className="trend up">↗ 8%</span></div><p>Ingresos confirmados</p><strong>$1.284.500</strong><small>CLP · agosto</small></article>
            <article className="stat-card"><div><span className="stat-icon mint">♙</span><span className="trend up">↗ 18%</span></div><p>Clientes activos</p><strong>342</strong><small>24 clientes nuevos</small></article>
            <article className="stat-card"><div><span className="stat-icon gold">◎</span><span className="trend neutral">94%</span></div><p>Tasa de asistencia</p><strong>94,2%</strong><small>Excelente desempeño</small></article>
          </div>

          <div className="main-grid">
            <article className="panel schedule-panel">
              <div className="panel-heading"><div><p className="eyebrow">HOY</p><h2>Próximas reservas</h2></div><button onClick={() => demo('Agenda completa')}>Ver agenda →</button></div>
              <div className="appointments">
                {appointments.map((a) => <button className="appointment" key={a.time} onClick={() => demo(`Reserva de ${a.name}`)}>
                  <time>{a.time}</time><i style={{ background: a.color }} /><span className="avatar" style={{ background: `${a.color}1e`, color: a.color }}>{a.name.split(' ').map(x=>x[0]).join('')}</span>
                  <span className="appointment-info"><strong>{a.name}</strong><small>{a.service}</small></span><span className="pro">con {a.pro}</span><b>›</b>
                </button>)}
              </div>
            </article>

            <aside className="panel quick-panel">
              <div className="panel-heading"><div><p className="eyebrow">ACCESOS</p><h2>Acciones rápidas</h2></div></div>
              <div className="quick-grid">
                <button onClick={() => demo('Nuevo cliente')}><span className="purple">＋</span><strong>Agregar cliente</strong><small>Crear una ficha</small></button>
                <button onClick={() => demo('Disponibilidad')}><span className="mint">◷</span><strong>Bloquear horario</strong><small>Ajustar agenda</small></button>
                <button onClick={() => demo('Nuevo servicio')}><span className="coral">◇</span><strong>Crear servicio</strong><small>Configurar precio</small></button>
                <button onClick={() => demo('Enviar mensaje')}><span className="gold">⌁</span><strong>Enviar mensaje</strong><small>Contactar clientes</small></button>
              </div>
              <div className="setup-card"><div className="setup-ring"><strong>75%</strong></div><div><strong>Completa tu cuenta</strong><small>Conecta un medio de pago para recibir abonos.</small><button onClick={() => demo('Configuración de pagos')}>Continuar configuración</button></div></div>
            </aside>
          </div>
        </div>}
      </section>
      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}

function AgendaModule({ demo }: { demo: (message: string) => void }) {
  const [view, setView] = useState<'Semana' | 'Día'>('Semana');
  const [professional, setProfessional] = useState('Todos');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<(typeof calendarBookings)[number] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [savedBookings, setSavedBookings] = useState<(typeof calendarBookings)[number][]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const visible = [...calendarBookings, ...savedBookings].filter(b => professional === 'Todos' || b.pro === professional);
  const hours = Array.from({ length: 11 }, (_, i) => i + 8);
  const label = weekOffset === 0 ? '24–29 agosto 2026' : weekOffset > 0 ? '31 agosto–5 septiembre 2026' : '17–22 agosto 2026';

  async function loadBookings() {
    try {
      const response = await fetch('/api/bookings', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar las reservas.');
      const data = await response.json() as { bookings: Array<{ id:number; starts_at:number; ends_at:number; customer_name:string; service_name:string; professional_name:string; payment_status:string }> };
      const mapped = data.bookings.map(b => {
        const start = new Date(b.starts_at * 1000);
        const chile = new Date(start.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
        const day = (chile.getDay() + 6) % 7;
        const hour = chile.getHours() + chile.getMinutes() / 60;
        return { id: 10000 + b.id, day, start: hour, span: (b.ends_at - b.starts_at) / 3600, name: b.customer_name, service: b.service_name.replace('Sesión de seguimiento','Seguimiento'), pro: b.professional_name.replace(' Martínez','').replace(' Reyes',''), color: b.service_name === 'Evaluación inicial' ? 'purple-event' : b.service_name === 'Consulta online' ? 'mint-event' : 'coral-event', paid: b.payment_status === 'paid' };
      }).filter(b => b.day >= 0 && b.day <= 5);
      setSavedBookings(mapped);
    } catch (error) { demo(error instanceof Error ? error.message : 'No fue posible cargar las reservas.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadBookings(); }, []);

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(''); setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch('/api/bookings', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      const result = await response.json() as { error?:string; message?:string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo crear la cita.');
      await loadBookings(); setShowNew(false); demo(result.message ?? 'Cita agendada correctamente');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo crear la cita.'); }
    finally { setSaving(false); }
  }

  return <div className="agenda-content">
    <div className="agenda-titlebar">
      <div><p className="eyebrow">GESTIÓN DE DISPONIBILIDAD</p><h1>Agenda</h1><p>Organiza las reservas y horarios de tu equipo.</p></div>
      <div className="agenda-actions"><button className="secondary-action" onClick={() => demo('Selecciona un espacio libre para bloquearlo')}>⊘ Bloquear horario</button><button className="primary" onClick={() => setShowNew(true)}><span>＋</span> Nueva reserva</button></div>
    </div>

    <section className="agenda-toolbar">
      <div className="date-nav"><button onClick={() => setWeekOffset(0)}>Hoy</button><button aria-label="Semana anterior" onClick={() => setWeekOffset(v => v - 1)}>‹</button><button aria-label="Semana siguiente" onClick={() => setWeekOffset(v => v + 1)}>›</button><strong>{label}</strong></div>
      <div className="agenda-filters"><label>Profesional <select value={professional} onChange={e => setProfessional(e.target.value)}><option>Todos</option><option>Sofía</option><option>Martín</option></select></label><div className="view-switch"><button className={view === 'Semana' ? 'active' : ''} onClick={() => setView('Semana')}>Semana</button><button className={view === 'Día' ? 'active' : ''} onClick={() => setView('Día')}>Día</button></div></div>
    </section>

    <div className="agenda-layout">
      <section className="calendar-card">
        <div className="calendar-scroll">
          <div className={view === 'Día' ? 'calendar-grid day-view' : 'calendar-grid'}>
            <div className="corner-cell" />
            {(view === 'Día' ? weekDays.filter(d => d.today) : weekDays).map(d => <div className={d.today ? 'day-head today' : 'day-head'} key={d.day}><span>{d.day}</span><strong>{d.date}</strong>{d.today && <em>Hoy</em>}</div>)}
            <div className="time-column">{hours.map(h => <time key={h}>{String(h).padStart(2,'0')}:00</time>)}</div>
            <div className="calendar-body" style={{ '--days': view === 'Día' ? 1 : 6 } as React.CSSProperties}>
              {hours.map(h => <div className="hour-line" style={{ top: `${(h - 8) * 72}px` }} key={h} />)}
              {Array.from({ length: view === 'Día' ? 1 : 6 }, (_, i) => <div className="day-line" style={{ left: `${(i * 100) / (view === 'Día' ? 1 : 6)}%` }} key={i} />)}
              {visible.filter(b => view === 'Semana' || b.day === 3).map(b => {
                const dayIndex = view === 'Día' ? 0 : b.day;
                return <button key={b.id} className={`calendar-event ${b.color}`} style={{ left: `calc(${dayIndex * (100 / (view === 'Día' ? 1 : 6))}% + 5px)`, width: `calc(${100 / (view === 'Día' ? 1 : 6)}% - 10px)`, top: `${(b.start - 8) * 72 + 5}px`, height: `${b.span * 72 - 8}px` }} onClick={() => setSelected(b)}><strong>{b.name}</strong><span>{b.service}</span><small>{String(Math.floor(b.start)).padStart(2,'0')}:{b.start % 1 ? '30' : '00'} · {b.pro}</small></button>;
              })}
              {loading && <div className="calendar-loading">Cargando reservas…</div>}
              <div className="now-line" style={{ top: `${(11.25 - 8) * 72}px` }}><span>11:15</span></div>
            </div>
          </div>
        </div>
      </section>

      <aside className="agenda-side">
        <section className="day-summary"><p className="eyebrow">JUEVES 27</p><h2>Resumen del día</h2><div><span><b>3</b><small>Reservas</small></span><span><b>2h 45m</b><small>Ocupación</small></span><span><b>$88.000</b><small>Ingresos</small></span></div></section>
        <section className="team-legend"><h3>Profesionales</h3><button className={professional === 'Todos' ? 'active' : ''} onClick={() => setProfessional('Todos')}><i className="all-dot"/><span><strong>Todo el equipo</strong><small>9 reservas</small></span></button><button className={professional === 'Sofía' ? 'active' : ''} onClick={() => setProfessional('Sofía')}><i className="sofia-dot"/><span><strong>Sofía Martínez</strong><small>5 reservas</small></span></button><button className={professional === 'Martín' ? 'active' : ''} onClick={() => setProfessional('Martín')}><i className="martin-dot"/><span><strong>Martín Reyes</strong><small>4 reservas</small></span></button></section>
      </aside>
    </div>

    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><article className="booking-detail" onClick={e => e.stopPropagation()}><button className="close-modal" onClick={() => setSelected(null)}>×</button><span className={`detail-status ${selected.paid ? 'paid' : 'pending'}`}>{selected.paid ? 'Pago confirmado' : 'Pago pendiente'}</span><h2>{selected.name}</h2><p>{selected.service}</p><dl><div><dt>Fecha y hora</dt><dd>Jueves 27 de agosto · {String(Math.floor(selected.start)).padStart(2,'0')}:{selected.start % 1 ? '30' : '00'}</dd></div><div><dt>Profesional</dt><dd>{selected.pro}</dd></div><div><dt>Duración</dt><dd>{selected.span * 60} minutos</dd></div></dl><div className="detail-actions"><button onClick={() => demo('Recordatorio enviado')}>Enviar recordatorio</button><button onClick={() => demo('Edición de reserva')}>Editar reserva</button></div></article></div>}
    {showNew && <div className="modal-backdrop"><form className="new-booking-modal" onSubmit={createBooking}><button type="button" className="close-modal" onClick={() => setShowNew(false)}>×</button><p className="eyebrow">NUEVA RESERVA</p><h2>Agendar una cita</h2><p>La reserva quedará guardada en la agenda del negocio.</p><div className="form-grid"><label className="full">Nombre del cliente<input name="customerName" required placeholder="Ej: Carolina González" /></label><label>Correo electrónico<input name="customerEmail" type="email" required placeholder="cliente@correo.cl" /></label><label>Teléfono<input name="customerPhone" type="tel" placeholder="+56 9 1234 5678" /></label><label>Servicio<select name="service" required defaultValue="Evaluación inicial"><option>Evaluación inicial</option><option>Sesión de seguimiento</option><option>Consulta online</option></select></label><label>Profesional<select name="professional" required defaultValue="Sofía Martínez"><option>Sofía Martínez</option><option>Martín Reyes</option></select></label><label>Fecha<input name="date" type="date" min="2026-08-22" defaultValue="2026-08-27" required /></label><label>Hora<input name="time" type="time" min="08:00" max="18:00" step="900" defaultValue="14:00" required /></label><label className="full">Notas<textarea name="notes" rows={3} placeholder="Información útil para la atención (opcional)" /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<div className="modal-footer"><button type="button" onClick={() => setShowNew(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar cita'}</button></div></form></div>}
  </div>;
}

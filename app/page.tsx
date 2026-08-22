'use client';

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';

const appointments = [
  { time: '09:00', name: 'Camila Soto', service: 'Evaluación inicial', pro: 'Sofía', color: '#7559f2' },
  { time: '10:30', name: 'Tomás Silva', service: 'Sesión de seguimiento', pro: 'Martín', color: '#ff8f6b' },
  { time: '12:00', name: 'Daniela Rojas', service: 'Consulta online', pro: 'Sofía', color: '#30b995' },
  { time: '15:30', name: 'Ignacio Pérez', service: 'Evaluación inicial', pro: 'Martín', color: '#f5b63b' },
];

const nav = ['Resumen', 'Agenda', 'Reservas', 'Clientes', 'Servicios', 'Equipo'];

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
            <button key={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item); if (!['Resumen','Agenda','Clientes','Servicios','Equipo'].includes(item)) demo(`${item}: módulo listo para conectar`); }}>
              <span className="nav-icon" aria-hidden="true">{['⌂','▦','◫','♙','◇','♚'][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={active==='Configuración'?'nav-item active':'nav-item'} onClick={() => setActive('Configuración')}>⚙ Configuración</button>
          <div className="profile"><span>FV</span><div><strong>Francisco</strong><small>Administrador</small></div><b>···</b></div>
        </div>
      </aside>

      <section className="workspace" id="top">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menú">☰</button>
          <div className="search"><span>⌕</span><input aria-label="Buscar" placeholder="Buscar clientes o reservas..." /><kbd>⌘ K</kbd></div>
          <div className="top-actions"><button aria-label="Notificaciones">♢<em>3</em></button><button className="public-link" onClick={() => window.location.assign('/reservar')}>↗ Ver mi página</button></div>
        </header>

        {active === 'Agenda' ? <AgendaModule demo={demo} /> : active === 'Clientes' ? <ClientsModule demo={demo} /> : active === 'Servicios' ? <ServicesModule demo={demo} /> : active === 'Equipo' ? <TeamModule demo={demo} /> : active === 'Configuración' ? <SettingsModule demo={demo} /> : <div className="content">
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

type AgendaBooking = { id:number; service_id:number; professional_id:number; starts_at:number; ends_at:number; status:string; payment_status:string; amount_clp:number; customer_name:string; service_name:string; professional_name:string };
type CalendarBooking = AgendaBooking & { day:number; start:number; span:number; color:string; dateKey:string };

const chileDateParts = (value:Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const localDateKey = (date:Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const bookingDateKey = (seconds:number) => { const p=chileDateParts(new Date(seconds*1000)); return `${p.year}-${p.month}-${p.day}`; };
const startOfWeek = (date:Date) => { const result=new Date(date); result.setHours(12,0,0,0); result.setDate(result.getDate()-((result.getDay()+6)%7)); return result; };
const addDays = (date:Date,days:number) => { const result=new Date(date); result.setDate(result.getDate()+days); return result; };

function AgendaModule({ demo }: { demo: (message: string) => void }) {
  const [view, setView] = useState<'Semana' | 'Día'>('Semana');
  const [professional, setProfessional] = useState('Todos');
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarBooking | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [savedBookings, setSavedBookings] = useState<AgendaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [agendaServices,setAgendaServices] = useState<Service[]>([]);
  const [agendaTeam,setAgendaTeam] = useState<TeamMember[]>([]);
  const hours = Array.from({ length: 11 }, (_, i) => i + 8);
  const weekStart = startOfWeek(focusDate);
  const days = view==='Semana' ? Array.from({length:7},(_,i)=>addDays(weekStart,i)) : [focusDate];
  const todayKey=localDateKey(new Date());
  const label=view==='Día' ? new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(focusDate) : `${new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short'}).format(days[0])} – ${new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short',year:'numeric'}).format(days[6])}`;
  const colorClasses=['purple-event','mint-event','coral-event'];
  const visible:CalendarBooking[]=savedBookings.map(b=>{const p=chileDateParts(new Date(b.starts_at*1000));const dateKey=bookingDateKey(b.starts_at);return {...b,dateKey,day:days.findIndex(d=>localDateKey(d)===dateKey),start:Number(p.hour)+Number(p.minute)/60,span:(b.ends_at-b.starts_at)/3600,color:colorClasses[Math.abs(Number(b.professional_id))%colorClasses.length]};}).filter(b=>b.day>=0&&(professional==='Todos'||String(b.professional_id)===professional));
  const summaryDate=view==='Día'?focusDate:(days.find(d=>localDateKey(d)===todayKey)??days[0]);
  const summaryKey=localDateKey(summaryDate);
  const summaryBookings=savedBookings.filter(b=>bookingDateKey(b.starts_at)===summaryKey&&(professional==='Todos'||String(b.professional_id)===professional));
  const occupiedMinutes=summaryBookings.reduce((total,b)=>total+Math.round((b.ends_at-b.starts_at)/60),0);
  const summaryIncome=summaryBookings.filter(b=>b.payment_status==='paid').reduce((total,b)=>total+Number(b.amount_clp),0);

  async function loadBookings() {
    try {
      const response = await fetch('/api/bookings', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar las reservas.');
      const data = await response.json() as { bookings: AgendaBooking[] };
      setSavedBookings(data.bookings);
    } catch (error) { demo(error instanceof Error ? error.message : 'No fue posible cargar las reservas.'); }
    finally { setLoading(false); }
  }
  async function loadServices(){try{const response=await fetch('/api/services',{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json() as {services:Service[]};setAgendaServices(data.services.filter(s=>Boolean(s.active)));}catch{demo('No fue posible cargar los servicios.');}}
  async function loadTeam(){try{const response=await fetch('/api/team',{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json() as {team:TeamMember[]};setAgendaTeam(data.team.filter(m=>Boolean(m.active)));}catch{demo('No fue posible cargar el equipo.');}}

  useEffect(() => { void loadBookings(); void loadServices(); void loadTeam(); }, []);

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(''); setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch('/api/bookings', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      const result = await response.json() as { error?:string; message?:string };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo crear la cita.');
      await loadBookings(); const date=String(payload.date); if(/^\d{4}-\d{2}-\d{2}$/.test(date))setFocusDate(new Date(`${date}T12:00:00`)); setShowNew(false); demo(result.message ?? 'Cita agendada correctamente');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo crear la cita.'); }
    finally { setSaving(false); }
  }

  return <div className="agenda-content">
    <div className="agenda-titlebar">
      <div><p className="eyebrow">GESTIÓN DE DISPONIBILIDAD</p><h1>Agenda</h1><p>Organiza las reservas y horarios de tu equipo.</p></div>
      <div className="agenda-actions"><button className="secondary-action" onClick={() => demo('Selecciona un espacio libre para bloquearlo')}>⊘ Bloquear horario</button><button className="primary" onClick={() => setShowNew(true)}><span>＋</span> Nueva reserva</button></div>
    </div>

    <section className="agenda-toolbar">
      <div className="date-nav"><button onClick={() => setFocusDate(new Date())}>Hoy</button><button aria-label={view==='Semana'?'Semana anterior':'Día anterior'} onClick={() => setFocusDate(d => addDays(d,view==='Semana'?-7:-1))}>‹</button><button aria-label={view==='Semana'?'Semana siguiente':'Día siguiente'} onClick={() => setFocusDate(d => addDays(d,view==='Semana'?7:1))}>›</button><strong>{label}</strong></div>
      <div className="agenda-filters"><label>Profesional <select value={professional} onChange={e => setProfessional(e.target.value)}><option value="Todos">Todos</option>{agendaTeam.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><div className="view-switch"><button className={view === 'Semana' ? 'active' : ''} onClick={() => setView('Semana')}>Semana</button><button className={view === 'Día' ? 'active' : ''} onClick={() => setView('Día')}>Día</button></div></div>
    </section>

    <div className="agenda-layout">
      <section className="calendar-card">
        <div className="calendar-scroll">
          <div className={view === 'Día' ? 'calendar-grid day-view' : 'calendar-grid'} style={{gridTemplateColumns:`62px repeat(${days.length}, minmax(105px, 1fr))`} as CSSProperties}>
            <div className="corner-cell" />
            {days.map(d => {const isToday=localDateKey(d)===todayKey;return <div className={isToday?'day-head today':'day-head'} key={localDateKey(d)}><span>{new Intl.DateTimeFormat('es-CL',{weekday:'short'}).format(d)}</span><strong>{d.getDate()}</strong>{isToday&&<em>Hoy</em>}</div>;})}
            <div className="time-column">{hours.map(h => <time key={h}>{String(h).padStart(2,'0')}:00</time>)}</div>
            <div className="calendar-body">
              {hours.map(h => <div className="hour-line" style={{ top: `${(h - 8) * 72}px` }} key={h} />)}
              {days.map((_,i) => <div className="day-line" style={{ left: `${(i * 100) / days.length}%` }} key={i} />)}
              {visible.map(b => {
                return <button key={b.id} className={`calendar-event ${b.color}`} style={{ left: `calc(${b.day * (100 / days.length)}% + 5px)`, width: `calc(${100 / days.length}% - 10px)`, top: `${Math.max(0,(b.start - 8) * 72 + 5)}px`, height: `${Math.max(34,b.span * 72 - 8)}px` }} onClick={() => setSelected(b)}><strong>{b.customer_name}</strong><span>{b.service_name}</span><small>{String(Math.floor(b.start)).padStart(2,'0')}:{String(Math.round((b.start%1)*60)).padStart(2,'0')} · {b.professional_name}</small></button>;
              })}
              {loading && <div className="calendar-loading">Cargando reservas…</div>}
            </div>
          </div>
        </div>
      </section>

      <aside className="agenda-side">
        <section className="day-summary"><p className="eyebrow">{new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric'}).format(summaryDate)}</p><h2>Resumen del día</h2><div><span><b>{summaryBookings.length}</b><small>Reservas</small></span><span><b>{Math.floor(occupiedMinutes/60)}h {occupiedMinutes%60}m</b><small>Ocupación</small></span><span><b>${summaryIncome.toLocaleString('es-CL')}</b><small>Ingresos pagados</small></span></div></section>
        <section className="team-legend"><h3>Profesionales</h3><button className={professional === 'Todos' ? 'active' : ''} onClick={() => setProfessional('Todos')}><i className="all-dot"/><span><strong>Todo el equipo</strong><small>{savedBookings.filter(b=>days.some(d=>localDateKey(d)===bookingDateKey(b.starts_at))).length} reservas visibles</small></span></button>{agendaTeam.map((m,index)=><button className={professional===String(m.id)?'active':''} onClick={()=>setProfessional(String(m.id))} key={m.id}><i style={{background:m.color||['#7659e8','#31aa86','#ed8060'][index%3]}}/><span><strong>{m.name}</strong><small>{savedBookings.filter(b=>b.professional_id===m.id&&days.some(d=>localDateKey(d)===bookingDateKey(b.starts_at))).length} reservas</small></span></button>)}</section>
      </aside>
    </div>

    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><article className="booking-detail" onClick={e => e.stopPropagation()}><button className="close-modal" onClick={() => setSelected(null)}>×</button><span className={`detail-status ${selected.payment_status==='paid'?'paid':'pending'}`}>{selected.payment_status==='paid'?'Pago confirmado':'Pago pendiente'}</span><h2>{selected.customer_name}</h2><p>{selected.service_name}</p><dl><div><dt>Fecha y hora</dt><dd>{new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(selected.starts_at*1000))}</dd></div><div><dt>Profesional</dt><dd>{selected.professional_name}</dd></div><div><dt>Duración</dt><dd>{Math.round(selected.span*60)} minutos</dd></div></dl><div className="detail-actions"><button onClick={() => demo('Recordatorio enviado')}>Enviar recordatorio</button><button onClick={() => demo('Edición de reserva')}>Editar reserva</button></div></article></div>}
    {showNew && <div className="modal-backdrop"><form className="new-booking-modal" onSubmit={createBooking}><button type="button" className="close-modal" onClick={() => setShowNew(false)}>×</button><p className="eyebrow">NUEVA RESERVA</p><h2>Agendar una cita</h2><p>La reserva quedará guardada en la agenda del negocio.</p><div className="form-grid"><label className="full">Nombre del cliente<input name="customerName" required placeholder="Ej: Carolina González" /></label><label>Correo electrónico<input name="customerEmail" type="email" required placeholder="cliente@correo.cl" /></label><label>Teléfono<input name="customerPhone" type="tel" placeholder="+56 9 1234 5678" /></label><label>Servicio<select name="serviceId" required defaultValue=""><option value="" disabled>Seleccionar servicio</option>{agendaServices.map(s=><option value={s.id} key={s.id}>{s.name} · ${Number(s.price_clp).toLocaleString('es-CL')}</option>)}</select></label><label>Profesional<select name="professionalId" required defaultValue=""><option value="" disabled>Seleccionar profesional</option>{agendaTeam.map(m=><option value={m.id} key={m.id}>{m.name} · {m.role}</option>)}</select></label><label>Fecha<input name="date" type="date" min={localDateKey(new Date())} defaultValue={localDateKey(focusDate)} required /></label><label>Hora<input name="time" type="time" min="08:00" max="18:00" step="900" defaultValue="14:00" required /></label><label className="full">Notas<textarea name="notes" rows={3} placeholder="Información útil para la atención (opcional)" /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<div className="modal-footer"><button type="button" onClick={() => setShowNew(false)}>Cancelar</button><button type="submit" disabled={saving||agendaServices.length===0||agendaTeam.length===0}>{saving ? 'Guardando…' : 'Confirmar cita'}</button></div></form></div>}
  </div>;
}

type Customer = { id:number; name:string; email:string; phone:string|null; notes:string|null; booking_count:number; paid_total:number; last_booking:number|null };
type Visit = { id:number; customer_id:number; starts_at:number; status:string; payment_status:string; amount_clp:number; service_name:string; professional_name:string };

function ClientsModule({ demo }: { demo:(message:string)=>void }) {
  const [customers,setCustomers] = useState<Customer[]>([]); const [visits,setVisits] = useState<Visit[]>([]);
  const [query,setQuery] = useState(''); const [selected,setSelected] = useState<Customer|null>(null); const [editing,setEditing] = useState<Customer|null>(null);
  const [showNew,setShowNew] = useState(false); const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [error,setError] = useState('');

  async function loadCustomers() {
    try { const response=await fetch('/api/customers',{cache:'no-store'}); if(!response.ok) throw new Error('No fue posible cargar los clientes.'); const data=await response.json() as {customers:Customer[];visits:Visit[]}; setCustomers(data.customers);setVisits(data.visits); if(selected){const fresh=data.customers.find(c=>c.id===selected.id);if(fresh)setSelected(fresh);} }
    catch(e){demo(e instanceof Error?e.message:'No fue posible cargar los clientes.');} finally{setLoading(false);}
  }
  useEffect(()=>{void loadCustomers();},[]);
  const filtered=customers.filter(c=>`${c.name} ${c.email} ${c.phone??''}`.toLowerCase().includes(query.toLowerCase()));
  const totalVisits=customers.reduce((sum,c)=>sum+Number(c.booking_count),0); const totalRevenue=customers.reduce((sum,c)=>sum+Number(c.paid_total),0);
  function initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
  function formatDate(value:number|null){if(!value)return 'Sin reservas';return new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value*1000));}
  async function submitCustomer(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError('');const payload=Object.fromEntries(new FormData(event.currentTarget).entries());if(editing)payload.id=String(editing.id);try{const response=await fetch('/api/customers',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw new Error(result.error??'No se pudo guardar el cliente.');await loadCustomers();setShowNew(false);setEditing(null);demo(result.message??'Cliente guardado.');}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el cliente.');}finally{setSaving(false);}}
  const customerVisits=selected?visits.filter(v=>v.customer_id===selected.id):[];

  return <div className="clients-content">
    <div className="clients-titlebar"><div><p className="eyebrow">RELACIONES Y SEGUIMIENTO</p><h1>Clientes</h1><p>Información, historial y actividad de todas las personas que atiendes.</p></div><button className="primary" onClick={()=>{setEditing(null);setShowNew(true);}}><span>＋</span> Nuevo cliente</button></div>
    <div className="client-stats"><article><span className="purple">♙</span><div><small>Clientes registrados</small><strong>{customers.length}</strong></div></article><article><span className="mint">↗</span><div><small>Atenciones acumuladas</small><strong>{totalVisits}</strong></div></article><article><span className="gold">$</span><div><small>Ingresos confirmados</small><strong>${totalRevenue.toLocaleString('es-CL')}</strong></div></article></div>
    <section className="clients-panel"><div className="clients-toolbar"><div className="client-search">⌕<input aria-label="Buscar clientes" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre, correo o teléfono..." /></div><span>{filtered.length} {filtered.length===1?'cliente':'clientes'}</span></div>
      <div className="clients-table-wrap"><table className="clients-table"><thead><tr><th>Cliente</th><th>Contacto</th><th>Última reserva</th><th>Atenciones</th><th>Ingresos</th><th></th></tr></thead><tbody>{loading?<tr><td colSpan={6} className="empty-clients">Cargando clientes…</td></tr>:filtered.length===0?<tr><td colSpan={6} className="empty-clients"><span>♙</span><strong>No encontramos clientes</strong><small>Crea uno nuevo o cambia la búsqueda.</small></td></tr>:filtered.map((c,index)=><tr key={c.id} onClick={()=>setSelected(c)}><td><div className={`customer-avatar tone-${index%4}`}>{initials(c.name)}</div><div><strong>{c.name}</strong><small>{c.notes?'Con notas':'Ficha activa'}</small></div></td><td><strong>{c.email}</strong><small>{c.phone||'Sin teléfono'}</small></td><td>{formatDate(c.last_booking)}</td><td><b>{c.booking_count}</b></td><td>${Number(c.paid_total).toLocaleString('es-CL')}</td><td><button aria-label={`Ver ficha de ${c.name}`}>›</button></td></tr>)}</tbody></table></div>
    </section>
    {selected&&<div className="client-drawer-backdrop" onClick={()=>setSelected(null)}><aside className="client-drawer" onClick={e=>e.stopPropagation()}><button className="close-modal" onClick={()=>setSelected(null)}>×</button><div className="drawer-profile"><span>{initials(selected.name)}</span><h2>{selected.name}</h2><p>Cliente activo</p></div><div className="drawer-actions"><button onClick={()=>{setEditing(selected);setShowNew(true);}}>✎ Editar</button><button onClick={()=>demo(`Nueva reserva para ${selected.name}`)}>＋ Agendar</button></div><dl className="customer-data"><div><dt>Correo electrónico</dt><dd>{selected.email}</dd></div><div><dt>Teléfono</dt><dd>{selected.phone||'No registrado'}</dd></div><div><dt>Notas</dt><dd>{selected.notes||'Sin notas adicionales.'}</dd></div></dl><div className="history-heading"><h3>Historial de citas</h3><span>{customerVisits.length}</span></div><div className="visit-history">{customerVisits.length===0?<p>Este cliente todavía no tiene citas.</p>:customerVisits.map(v=><article key={v.id}><i className={v.status==='completed'?'done':'upcoming'}></i><div><strong>{v.service_name}</strong><small>{new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v.starts_at*1000))} · {v.professional_name}</small></div><span className={v.payment_status==='paid'?'paid':'pending'}>{v.payment_status==='paid'?'Pagado':'Pendiente'}</span></article>)}</div></aside></div>}
    {showNew&&<div className="modal-backdrop"><form className="new-booking-modal customer-form" onSubmit={submitCustomer}><button type="button" className="close-modal" onClick={()=>{setShowNew(false);setEditing(null);setError('');}}>×</button><p className="eyebrow">{editing?'EDITAR CLIENTE':'NUEVO CLIENTE'}</p><h2>{editing?'Actualizar ficha':'Crear ficha de cliente'}</h2><p>Estos datos estarán disponibles al momento de agendar.</p><div className="form-grid"><label className="full">Nombre completo<input name="name" required defaultValue={editing?.name??''} placeholder="Ej: Carolina González" /></label><label>Correo electrónico<input name="email" type="email" required defaultValue={editing?.email??''} placeholder="cliente@correo.cl" /></label><label>Teléfono<input name="phone" type="tel" defaultValue={editing?.phone??''} placeholder="+56 9 1234 5678" /></label><label className="full">Notas<textarea name="notes" rows={5} defaultValue={editing?.notes??''} placeholder="Preferencias, observaciones o información relevante" /></label></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="modal-footer"><button type="button" onClick={()=>{setShowNew(false);setEditing(null);}}>Cancelar</button><button type="submit" disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':'Crear cliente'}</button></div></form></div>}
  </div>;
}

type Service = { id:number;name:string;description:string|null;mode:'presencial'|'online'|'hibrido';duration_minutes:number;price_clp:number;deposit_percent:number;active:number|boolean;booking_count:number;paid_total:number };

function ServicesModule({demo}:{demo:(message:string)=>void}){
  const [services,setServices]=useState<Service[]>([]);const [loading,setLoading]=useState(true);const [showForm,setShowForm]=useState(false);const [editing,setEditing]=useState<Service|null>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [filter,setFilter]=useState<'todos'|'activos'|'pausados'>('todos');
  async function loadServices(){try{const response=await fetch('/api/services',{cache:'no-store'});if(!response.ok)throw new Error('No fue posible cargar los servicios.');const data=await response.json() as {services:Service[]};setServices(data.services);}catch(e){demo(e instanceof Error?e.message:'No fue posible cargar los servicios.');}finally{setLoading(false);}}
  useEffect(()=>{void loadServices();},[]);
  const visible=services.filter(s=>filter==='todos'||(filter==='activos'?Boolean(s.active):!Boolean(s.active)));const activeCount=services.filter(s=>Boolean(s.active)).length;const totalBookings=services.reduce((n,s)=>n+Number(s.booking_count),0);const avgPrice=activeCount?Math.round(services.filter(s=>Boolean(s.active)).reduce((n,s)=>n+Number(s.price_clp),0)/activeCount):0;
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError('');const payload=Object.fromEntries(new FormData(event.currentTarget).entries());if(editing)payload.id=String(editing.id);try{const response=await fetch('/api/services',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw new Error(result.error??'No se pudo guardar el servicio.');await loadServices();setShowForm(false);setEditing(null);demo(result.message??'Servicio guardado.');}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el servicio.');}finally{setSaving(false);}}
  async function toggle(service:Service){try{const response=await fetch('/api/services',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:service.id,active:!Boolean(service.active)})});const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw new Error(result.error);await loadServices();demo(result.message??'Estado actualizado.');}catch(e){demo(e instanceof Error?e.message:'No se pudo actualizar el servicio.');}}
  const modeLabel={presencial:'Presencial',online:'Online',hibrido:'Híbrido'};
  return <div className="services-content"><div className="services-titlebar"><div><p className="eyebrow">CATÁLOGO COMERCIAL</p><h1>Servicios</h1><p>Configura lo que ofreces, cuánto dura y cuánto cobras.</p></div><button className="primary" onClick={()=>{setEditing(null);setShowForm(true);}}><span>＋</span> Nuevo servicio</button></div>
    <div className="service-stats"><article><span className="purple">◇</span><div><small>Servicios activos</small><strong>{activeCount}</strong></div></article><article><span className="mint">▦</span><div><small>Reservas acumuladas</small><strong>{totalBookings}</strong></div></article><article><span className="gold">$</span><div><small>Precio promedio</small><strong>${avgPrice.toLocaleString('es-CL')}</strong></div></article></div>
    <div className="service-filter"><div><button className={filter==='todos'?'active':''} onClick={()=>setFilter('todos')}>Todos <span>{services.length}</span></button><button className={filter==='activos'?'active':''} onClick={()=>setFilter('activos')}>Activos <span>{activeCount}</span></button><button className={filter==='pausados'?'active':''} onClick={()=>setFilter('pausados')}>Pausados <span>{services.length-activeCount}</span></button></div><small>Los servicios activos aparecen al crear una reserva.</small></div>
    <section className="service-grid">{loading?<div className="services-empty">Cargando servicios…</div>:visible.length===0?<div className="services-empty">No hay servicios en esta categoría.</div>:visible.map((s,index)=><article className={!Boolean(s.active)?'service-card paused':'service-card'} key={s.id}><div className="service-card-head"><span className={`service-symbol tone-${index%4}`}>◇</span><div><strong>{s.name}</strong><small>{modeLabel[s.mode]}</small></div><button aria-label={`Opciones de ${s.name}`} onClick={()=>{setEditing(s);setShowForm(true);}}>···</button></div><p>{s.description||'Sin descripción.'}</p><div className="service-details"><span>◷ <b>{s.duration_minutes} min</b></span><span>$ <b>${Number(s.price_clp).toLocaleString('es-CL')}</b></span><span>↗ <b>{s.booking_count} reservas</b></span></div>{Number(s.deposit_percent)>0&&<div className="deposit-chip">Abono requerido: {s.deposit_percent}%</div>}<footer><label><input type="checkbox" checked={Boolean(s.active)} onChange={()=>void toggle(s)} /><i></i>{Boolean(s.active)?'Activo':'Pausado'}</label><button onClick={()=>{setEditing(s);setShowForm(true);}}>Editar</button></footer></article>)}</section>
    {showForm&&<div className="modal-backdrop"><form className="new-booking-modal service-form" onSubmit={save}><button type="button" className="close-modal" onClick={()=>{setShowForm(false);setEditing(null);setError('');}}>×</button><p className="eyebrow">{editing?'EDITAR SERVICIO':'NUEVO SERVICIO'}</p><h2>{editing?'Actualizar servicio':'Crear un servicio'}</h2><p>Los servicios activos podrán seleccionarse desde Agenda.</p><div className="form-grid"><label className="full">Nombre del servicio<input name="name" required defaultValue={editing?.name??''} placeholder="Ej: Consulta nutricional" /></label><label>Modalidad<select name="mode" defaultValue={editing?.mode??'presencial'}><option value="presencial">Presencial</option><option value="online">Online</option><option value="hibrido">Híbrido</option></select></label><label>Duración<select name="durationMinutes" defaultValue={editing?.duration_minutes??60}><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option><option value="120">120 minutos</option></select></label><label>Precio CLP<input name="priceClp" type="number" min="0" step="1000" required defaultValue={editing?.price_clp??30000} /></label><label>Abono requerido<input name="depositPercent" type="number" min="0" max="100" step="5" defaultValue={editing?.deposit_percent??0} /></label><label className="full">Descripción<textarea name="description" rows={4} defaultValue={editing?.description??''} placeholder="Explica brevemente qué incluye el servicio" /></label></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="modal-footer"><button type="button" onClick={()=>{setShowForm(false);setEditing(null);}}>Cancelar</button><button type="submit" disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':'Crear servicio'}</button></div></form></div>}
  </div>;
}

type TeamMember={id:number;name:string;email:string;phone:string|null;role:string;color:string;active:number|boolean;booking_count:number;paid_total:number;upcoming_count:number};

function TeamModule({demo}:{demo:(message:string)=>void}){
  const [team,setTeam]=useState<TeamMember[]>([]);const [loading,setLoading]=useState(true);const [showForm,setShowForm]=useState(false);const [editing,setEditing]=useState<TeamMember|null>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  async function loadTeam(){try{const response=await fetch('/api/team',{cache:'no-store'});if(!response.ok)throw new Error('No fue posible cargar el equipo.');const data=await response.json() as {team:TeamMember[]};setTeam(data.team);}catch(e){demo(e instanceof Error?e.message:'No fue posible cargar el equipo.');}finally{setLoading(false);}}
  useEffect(()=>{void loadTeam();},[]);
  const activeCount=team.filter(m=>Boolean(m.active)).length;const bookings=team.reduce((n,m)=>n+Number(m.booking_count),0);const revenue=team.reduce((n,m)=>n+Number(m.paid_total),0);
  function initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError('');const payload=Object.fromEntries(new FormData(event.currentTarget).entries());if(editing)payload.id=String(editing.id);try{const response=await fetch('/api/team',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw new Error(result.error??'No se pudo guardar el integrante.');await loadTeam();setShowForm(false);setEditing(null);demo(result.message??'Integrante guardado.');}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el integrante.');}finally{setSaving(false);}}
  async function toggle(member:TeamMember){try{const response=await fetch('/api/team',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:member.id,active:!Boolean(member.active)})});const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw new Error(result.error);await loadTeam();demo(result.message??'Agenda actualizada.');}catch(e){demo(e instanceof Error?e.message:'No se pudo actualizar la agenda.');}}
  return <div className="team-content"><div className="team-titlebar"><div><p className="eyebrow">PERSONAS Y AGENDAS</p><h1>Equipo</h1><p>Administra quién presta servicios y revisa su desempeño.</p></div><button className="primary" onClick={()=>{setEditing(null);setShowForm(true);}}><span>＋</span> Nuevo integrante</button></div>
    <div className="team-stats"><article><span className="purple">♚</span><div><small>Integrantes activos</small><strong>{activeCount}</strong></div></article><article><span className="mint">▦</span><div><small>Reservas gestionadas</small><strong>{bookings}</strong></div></article><article><span className="gold">$</span><div><small>Ingresos del equipo</small><strong>${revenue.toLocaleString('es-CL')}</strong></div></article></div>
    <section className="team-grid">{loading?<div className="team-empty">Cargando equipo…</div>:team.map((m,index)=><article className={!Boolean(m.active)?'member-card paused':'member-card'} key={m.id}><header><span style={{background:`${m.color}1e`,color:m.color}}>{initials(m.name)}</span><div><strong>{m.name}</strong><small>{m.role}</small></div><button onClick={()=>{setEditing(m);setShowForm(true);}}>···</button></header><div className="member-contact"><span>✉ {m.email}</span><span>☎ {m.phone||'Sin teléfono'}</span></div><div className="member-metrics"><span><b>{m.upcoming_count}</b><small>Próximas</small></span><span><b>{m.booking_count}</b><small>Reservas</small></span><span><b>${Number(m.paid_total).toLocaleString('es-CL')}</b><small>Ingresos</small></span></div><footer><label><input type="checkbox" checked={Boolean(m.active)} onChange={()=>void toggle(m)} /><i></i>{Boolean(m.active)?'Agenda activa':'Agenda pausada'}</label><button onClick={()=>demo(`Agenda de ${m.name}`)}>Ver agenda →</button></footer></article>)}</section>
    <section className="team-note"><span>ℹ</span><div><strong>El equipo está conectado con Agenda</strong><p>Solo los integrantes con agenda activa aparecen al crear una reserva. Al pausar una agenda se conservan sus citas e historial.</p></div></section>
    {showForm&&<div className="modal-backdrop"><form className="new-booking-modal team-form" onSubmit={save}><button type="button" className="close-modal" onClick={()=>{setShowForm(false);setEditing(null);setError('');}}>×</button><p className="eyebrow">{editing?'EDITAR INTEGRANTE':'NUEVO INTEGRANTE'}</p><h2>{editing?'Actualizar perfil':'Agregar al equipo'}</h2><p>El integrante tendrá una agenda disponible para recibir reservas.</p><div className="form-grid"><label className="full">Nombre completo<input name="name" required defaultValue={editing?.name??''} placeholder="Ej: Andrea Morales" /></label><label>Correo electrónico<input name="email" type="email" required defaultValue={editing?.email??''} placeholder="persona@negocio.cl" /></label><label>Teléfono<input name="phone" type="tel" defaultValue={editing?.phone??''} placeholder="+56 9 1234 5678" /></label><label>Cargo o especialidad<input name="role" required defaultValue={editing?.role??'Especialista'} placeholder="Ej: Psicóloga" /></label><label>Color de agenda<div className="color-field"><input name="color" type="color" defaultValue={editing?.color??'#7559f2'} /><span>Identificación visual</span></div></label></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="modal-footer"><button type="button" onClick={()=>{setShowForm(false);setEditing(null);}}>Cancelar</button><button type="submit" disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':'Agregar integrante'}</button></div></form></div>}
  </div>;
}

type Settings={name:string;email:string|null;phone:string|null;address:string|null;description:string|null;timezone:string;currency:string;cancellation_hours:number;booking_window_days:number};
function SettingsModule({demo}:{demo:(message:string)=>void}){const [settings,setSettings]=useState<Settings|null>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');useEffect(()=>{fetch('/api/settings',{cache:'no-store'}).then(r=>r.json()).then((d:{settings:Settings})=>setSettings(d.settings)).catch(()=>demo('No fue posible cargar la configuración.'));},[]);async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setError('');const payload=Object.fromEntries(new FormData(e.currentTarget).entries());try{const r=await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json() as {error?:string;message?:string};if(!r.ok)throw new Error(d.error);demo(d.message??'Configuración guardada.');}catch(x){setError(x instanceof Error?x.message:'No se pudo guardar.');}finally{setSaving(false);}}return <div className="settings-content"><div className="settings-title"><p className="eyebrow">ADMINISTRACIÓN</p><h1>Configuración</h1><p>Define la identidad y las reglas de reserva de tu negocio.</p></div>{!settings?<div className="settings-loading">Cargando configuración…</div>:<form className="settings-form" onSubmit={save}><section><header><span>01</span><div><h2>Información del negocio</h2><p>Estos datos aparecerán en tu página pública.</p></div></header><div className="form-grid"><label className="full">Nombre del negocio<input name="name" required defaultValue={settings.name}/></label><label>Correo de contacto<input name="email" type="email" defaultValue={settings.email??''}/></label><label>Teléfono<input name="phone" defaultValue={settings.phone??''}/></label><label className="full">Dirección<input name="address" defaultValue={settings.address??''}/></label><label className="full">Descripción<textarea name="description" rows={4} defaultValue={settings.description??''}/></label></div></section><section><header><span>02</span><div><h2>Reglas de reserva</h2><p>Controla anticipación, cancelaciones y moneda.</p></div></header><div className="form-grid"><label>Zona horaria<select name="timezone" defaultValue={settings.timezone}><option value="America/Santiago">Santiago</option><option value="America/Bogota">Bogotá</option><option value="America/Mexico_City">Ciudad de México</option><option value="Europe/Madrid">Madrid</option></select></label><label>Moneda<select name="currency" defaultValue={settings.currency}><option>CLP</option><option>USD</option><option>EUR</option></select></label><label>Cancelación mínima (horas)<input name="cancellationHours" type="number" min="0" defaultValue={settings.cancellation_hours}/></label><label>Ventana de reserva (días)<input name="bookingWindowDays" type="number" min="1" max="365" defaultValue={settings.booking_window_days}/></label></div></section>{error&&<div className="form-error">{error}</div>}<footer><a href="/reservar" target="_blank">↗ Ver página pública</a><button className="primary" disabled={saving}>{saving?'Guardando…':'Guardar configuración'}</button></footer></form>}</div>}

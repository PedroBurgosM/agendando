'use client';
import { FormEvent, useEffect, useState } from 'react';
import { parseScheduleToSlots, calculateRecurringSessions, type ParsedSlot } from '../lib/recurring';

type Catalog = {
  business: {
    name: string;
    description: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
    cancellation_hours: number;
  };
  services: Array<{
    id: number;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_clp: number;
    mode: string;
    class_type?: string;
    capacity?: number;
    billing_period?: string;
    schedule?: string | null;
    instructor_id?: number | null;
    instructor_name?: string | null;
    show_instructor?: boolean;
    show_schedule?: boolean;
    schedule_mode?: 'fixed' | 'flexible';
  }>;
  team: Array<{
    id: number;
    name: string;
    role: string;
    color: string;
  }>;
};

export default function BookingPage() {
  const [data, setData] = useState<Catalog | null>(null);
  const [service, setService] = useState<number | null>(null);
  const [professional, setProfessional] = useState<number | null>(null);
  const [slot, setSlot] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmationData, setConfirmationData] = useState<{
    serviceName?: string;
    professionalName?: string;
    classDateStr?: string;
    classTimeStr?: string;
    studentWaUrl?: string | null;
    customerEmail?: string;
    customerPhone?: string;
    bookingsCount?: number;
  } | null>(null);

  const [businessSlug, setBusinessSlug] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('negocio') || params.get('slug') || '';
    setBusinessSlug(s);
    const endpoint = s ? `/api/public/bookings?slug=${encodeURIComponent(s)}` : '/api/public/bookings';

    fetch(endpoint, { cache: 'no-store' })
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        const catalog = d as Catalog;
        setData(catalog);
        const firstService = catalog.services[0];
        setService(firstService?.id ?? null);
        const defaultProfId = firstService?.instructor_id || catalog.team[0]?.id || null;
        setProfessional(defaultProfId);
        if (firstService?.schedule && firstService.schedule !== 'null' && firstService.show_schedule !== false && firstService.schedule_mode !== 'flexible') {
          const slots = parseScheduleToSlots(firstService.schedule);
          if (slots.length > 0) {
            setSelectedDate(slots[0].date);
            setSlot(slots[0].time);
          }
        } else {
          setSelectedDate(new Date().toISOString().slice(0, 10));
          setSlot('A convenir');
        }
      })
      .catch(() => setError('La página de reservas no está disponible.'));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !professional || !slot) return setError('Selecciona clase, instructor y hora.');
    setSaving(true);
    setError('');
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    Object.assign(payload, { serviceId: String(service), professionalId: String(professional), time: slot, slug: businessSlug });

    try {
      const r = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json() as {
        error?: string;
        message?: string;
        serviceName?: string;
        professionalName?: string;
        classDateStr?: string;
        classTimeStr?: string;
        studentWaUrl?: string | null;
        customerEmail?: string;
        customerPhone?: string;
        bookingsCount?: number;
      };
      if (!r.ok) throw new Error(d.error ?? 'No se pudo confirmar tu reserva.');
      setConfirmationData(d);
      setDone(true);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No se pudo confirmar.');
    } finally {
      setSaving(false);
    }
  }

  const chosen = data?.services.find(s => s.id === service);

  if (done) {
    return (
      <main className="booking-page">
        <section className="success-card" style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
          <span style={{ fontSize: '42px', display: 'inline-block', marginBottom: '8px' }}>✓</span>
          <p className="eyebrow" style={{ letterSpacing: '1px', color: '#16a34a', fontWeight: 700 }}>CUPO CONFIRMADO</p>
          <h1 style={{ fontSize: '26px', margin: '8px 0 12px' }}>¡Tu lugar ha sido reservado!</h1>
          
          {confirmationData && (
            <div style={{
              background: '#f4f4f5',
              border: '1px solid #e4e4e7',
              borderRadius: '12px',
              padding: '16px',
              margin: '16px 0 20px',
              textAlign: 'left',
              fontSize: '14px',
              lineHeight: 1.6
            }}>
              <div><strong>Clase:</strong> {confirmationData.serviceName}</div>
              {chosen?.show_instructor !== false && confirmationData.professionalName ? (
                <div><strong>Instructor/a:</strong> {confirmationData.professionalName}</div>
              ) : null}
              {confirmationData.bookingsCount && confirmationData.bookingsCount > 1 ? (
                <div><strong>Clases reservadas:</strong> Las {confirmationData.bookingsCount} clases del mes</div>
              ) : null}
              {confirmationData.classTimeStr && (confirmationData.classTimeStr.includes('coordinar') || confirmationData.classTimeStr.includes('convenir')) ? (
                <>
                  <div><strong>Fecha estimada:</strong> {confirmationData.classDateStr}</div>
                  <div><strong>Horario:</strong> A coordinar directamente con tu instructor</div>
                </>
              ) : (
                <div><strong>Próxima clase:</strong> {confirmationData.classDateStr} a las {confirmationData.classTimeStr} hrs</div>
              )}
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e4e4e7', fontSize: '13px', color: '#52525b' }}>
                🔔 <strong>Notificaciones automáticas:</strong>
                <br />• Se registró el recordatorio para tu instructor/a <strong>{confirmationData.professionalName}</strong>.
                <br />• Se preparó tu confirmación a <strong>{confirmationData.customerEmail}</strong>.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '16px 0' }}>
            {confirmationData?.studentWaUrl && (
              <a
                href={confirmationData.studentWaUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: '#25D366',
                  color: '#ffffff',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '14px',
                  textDecoration: 'none',
                  boxShadow: '0 2px 8px rgba(37,211,102,0.2)'
                }}
              >
                <span>💬</span> Guardar / Enviar recordatorio a mi WhatsApp
              </a>
            )}
            <button
              type="button"
              style={{
                background: '#27272a',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer'
              }}
              onClick={() => location.reload()}
            >
              Inscribirme a otra clase
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="booking-page">
        <div className="public-loading">{error || 'Cargando clases disponibles…'}</div>
      </main>
    );
  }

  return (
    <main className="booking-page">
      <header className="booking-header">
        <a className="brand" href="/reservar">
          <img src="/logo-icon.png" alt="Logo Agendando" className="brand-logo-img" />
          <div className="brand-text">
            <span className="brand-title">Agendando</span>
            <span className="brand-subtitle">Reserva de Cupos</span>
          </div>
        </a>
        <span>Reserva segura de cupos</span>
      </header>

      <form className="booking-wrap" onSubmit={submit}>
        <section className="business-card">
          <div className="business-cover">
            <span className="business-logo-holder">
              <img src="/logo-icon.png" alt={data.business.name} />
            </span>
          </div>
          <div>
            <p className="eyebrow">RESERVA TU CUPO</p>
            <h1>{data.business.name}</h1>
            <p>{data.business.description || 'Inscríbete a tus clases en pocos pasos.'}</p>
            <ul>
              <li>⌖ {data.business.address || 'Espacio de entrenamiento y clases'}</li>
              <li>☎ {data.business.phone || 'Contacto disponible al confirmar'}</li>
            </ul>
          </div>
        </section>

        <section className="booking-flow">
          <div className="booking-step">
            <span>1</span>
            <div>
              <h2>Elige una clase</h2>
              <p>Selecciona la sesión a la que deseas asistir.</p>
            </div>
          </div>

          <div className="service-list">
            {data.services.map(s => {
              const isGroup = s.class_type === 'grupal';
              return (
                <button
                  type="button"
                  key={s.id}
                  className={service === s.id ? 'selected' : ''}
                  onClick={() => {
                    setService(s.id);
                    if (s.instructor_id) {
                      setProfessional(s.instructor_id);
                    }
                    if (s.schedule && s.schedule !== 'null' && s.show_schedule !== false && s.schedule_mode !== 'flexible') {
                      const slots = parseScheduleToSlots(s.schedule);
                      if (slots.length > 0) {
                        setSelectedDate(slots[0].date);
                        setSlot(slots[0].time);
                      }
                    } else {
                      setSelectedDate(new Date().toISOString().slice(0, 10));
                      setSlot('A convenir');
                    }
                  }}
                >
                  <i>{service === s.id ? '✓' : ''}</i>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <strong>{s.name}</strong>
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 700,
                        background: s.billing_period === 'anual' ? '#fef3c7' : '#e0e7ff',
                        color: s.billing_period === 'anual' ? '#b45309' : '#3730a3',
                      }}>
                        {s.billing_period === 'anual' ? '🗓️ Anual' : s.billing_period === 'sesion' ? '🎟️ Por Sesión' : '📅 Mensual'}
                      </span>
                    </div>
                    <small style={{ display: 'block', marginTop: '2px', color: '#475569' }}>
                      {isGroup ? `👥 Grupal · Cupo max: ${s.capacity || 10} alumnos` : '👤 Clase Individual'}
                      {s.show_instructor !== false && s.instructor_name ? ` · 👤 ${s.instructor_name}` : ''}
                      {s.description ? ` · ${s.description}` : ''}
                    </small>
                    {s.schedule && s.schedule !== 'null' && s.show_schedule !== false && s.schedule_mode !== 'flexible' ? (
                      <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🕒</span>
                        <span>{s.schedule}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '2px 8px', fontWeight: 600, marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>💬</span>
                        <span>Horario a coordinar con el instructor</span>
                      </div>
                    )}
                    <em>{s.duration_minutes} min</em>
                  </div>
                  <b style={{ textAlign: 'right' }}>
                    ${Number(s.price_clp).toLocaleString('es-CL')}
                    <small style={{ display: 'block', fontSize: '10px', color: '#71717a', fontWeight: 600 }}>
                      {s.billing_period === 'anual' ? '/ año' : s.billing_period === 'sesion' ? '/ sesión' : '/ mes'}
                    </small>
                  </b>
                </button>
              );
            })}
          </div>

          {(!chosen || chosen.show_instructor !== false) && (
            <>
              <div className="booking-step">
                <span>2</span>
                <div>
                  <h2>Elige un instructor</h2>
                  <p>Selecciona con quién tomarás la clase.</p>
                </div>
              </div>

              <div className="people-list">
                {data.team.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    className={professional === p.id ? 'selected' : ''}
                    onClick={() => setProfessional(p.id)}
                  >
                    <span style={{ color: p.color }}>{p.name.split(/\s+/).map(x => x[0]).slice(0, 2).join('')}</span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.role}</small>
                    </div>
                    <i>{professional === p.id ? '✓' : ''}</i>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="booking-step">
            <span>{(!chosen || chosen.show_instructor !== false) ? '3' : '2'}</span>
            <div>
              <h2>Fecha, horario y tus datos</h2>
              <p>Los cupos se validan y aseguran inmediatamente.</p>
            </div>
          </div>

          <div className="form-grid public-contact">
            {chosen?.schedule && chosen.schedule !== 'null' && chosen.show_schedule !== false && chosen.schedule_mode !== 'flexible' ? (
              <div className="full" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    🗓️ Horario de la clase: <strong>{chosen.schedule}</strong>
                  </span>
                  <div style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', fontWeight: 700 }}>
                    Inicio: {selectedDate} · {slot} hrs
                  </div>
                </div>
                {(() => {
                  const chosenSlots = parseScheduleToSlots(chosen.schedule);
                  if (chosenSlots.length === 0) return null;
                  return (
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                        Selecciona el día de tu primera clase:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {chosenSlots.map((s, idx) => {
                          const isSelected = selectedDate === s.date && slot === s.time;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setSelectedDate(s.date);
                                setSlot(s.time);
                              }}
                              style={{
                                background: isSelected ? '#18181b' : '#ffffff',
                                color: isSelected ? '#ffffff' : '#334155',
                                border: isSelected ? '1px solid #18181b' : '1px solid #cbd5e1',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span>{isSelected ? '✓' : '•'}</span>
                              <span>{s.label} ({s.date.slice(5)})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    O reasigna el día y la hora de tu primera clase:
                  </span>
                  <div className="booking-reschedule-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block' }}>
                        Fecha:
                        <input
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          style={{ height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 600, marginTop: '2px', background: '#ffffff', color: '#0f172a' }}
                        />
                      </label>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block' }}>
                        Hora:
                        <select
                          value={slot}
                          onChange={(e) => setSlot(e.target.value)}
                          style={{ height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 600, marginTop: '2px', background: '#ffffff', color: '#0f172a' }}
                        >
                          {['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'].map(t => (
                            <option key={t} value={t}>{t} hrs</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
                <input type="hidden" name="date" value={selectedDate} />

                {(() => {
                  const recurringPreview = chosen ? calculateRecurringSessions({
                    serviceName: chosen.name,
                    billingPeriod: chosen.billing_period,
                    schedule: chosen.schedule,
                    startDate: selectedDate || new Date().toISOString().slice(0, 10),
                    startTime: slot || '18:00',
                  }) : [];

                  if (recurringPreview.length <= 1) return null;

                  return (
                    <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          ✓ Plan mensual completo: Incluye las {recurringPreview.length} clases del mes
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#15803d' }}>
                          {recurringPreview.length} clases
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '110px', overflowY: 'auto' }}>
                        {recurringPreview.map((s, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #86efac',
                              borderRadius: '6px',
                              padding: '3px 7px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#166534',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 700 }}>#{idx + 1}</span>
                            <span>{s.dayName} {s.date.slice(5)} · {s.time}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="full" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                  <span>💬</span>
                  <span>Horario a coordinar con el instructor</span>
                </div>
                <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Esta clase no tiene un horario rígido previo. Una vez confirmada tu reserva, el instructor se comunicará directamente contigo vía WhatsApp o llamada para coordinar juntos los días y horas exactas.
                </p>

                <div className="booking-reschedule-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                      Fecha deseada de inicio:
                    </label>
                    <input
                      name="date"
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      required
                      style={{ height: '38px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 600, background: '#ffffff', color: '#0f172a' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                      Preferencia de horario:
                    </label>
                    <select
                      value={slot}
                      onChange={(e) => setSlot(e.target.value)}
                      style={{ height: '38px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 600, background: '#ffffff', color: '#0f172a' }}
                    >
                      <option value="A convenir">A convenir / Por definir</option>
                      <option value="Mañanas (08:00 - 12:00)">Mañanas (08:00 - 12:00)</option>
                      <option value="Mediodía (12:00 - 15:00)">Mediodía (12:00 - 15:00)</option>
                      <option value="Tardes (15:00 - 18:00)">Tardes (15:00 - 18:00)</option>
                      <option value="Noches (18:00 - 21:00)">Noches (18:00 - 21:00)</option>
                    </select>
                  </div>
                </div>
                <input type="hidden" name="time" value={slot || 'A convenir'} />
              </div>
            )}
            <label className="full">Nombre del alumno
              <input name="customerName" required placeholder="Tu nombre y apellido" />
            </label>
            <label>Correo electrónico
              <input name="customerEmail" type="email" required placeholder="tu@correo.cl" />
            </label>
            <label>WhatsApp / Teléfono
              <input name="customerPhone" type="tel" placeholder="+56 9 1234 5678" />
            </label>
          </div>

          {error && <div className="form-error" style={{ color: '#c53030', background: '#fef2f2', padding: '10px', borderRadius: '8px', fontSize: '10px', margin: '10px 0' }}>{error}</div>}

          <button className="confirm-booking" disabled={saving || !chosen}>
            {saving ? 'Validando cupo…' : `Confirmar inscripción · $${Number(chosen?.price_clp ?? 0).toLocaleString('es-CL')}`}
          </button>
          <p className="secure-note">
            {chosen?.class_type === 'grupal'
              ? `Clase grupal con aforo limitado de ${chosen.capacity || 10} alumnos. Podrás cancelar con ${data.business.cancellation_hours} horas de anticipación.`
              : `Clase particular individual. Podrás cancelar con ${data.business.cancellation_hours} horas de anticipación.`}
          </p>
        </section>
      </form>
    </main>
  );
}

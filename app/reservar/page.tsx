'use client';
import { FormEvent, useEffect, useState } from 'react';

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
  } | null>(null);

  useEffect(() => {
    fetch('/api/public/bookings', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: any) => {
        const catalog = d as Catalog;
        setData(catalog);
        setService(catalog.services[0]?.id ?? null);
        setProfessional(catalog.team[0]?.id ?? null);
      })
      .catch(() => setError('La página de reservas no está disponible.'));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !professional || !slot) return setError('Selecciona clase, instructor y hora.');
    setSaving(true);
    setError('');
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    Object.assign(payload, { serviceId: String(service), professionalId: String(professional), time: slot });

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
              <div><strong>Instructor/a:</strong> {confirmationData.professionalName}</div>
              <div><strong>Fecha y hora:</strong> {confirmationData.classDateStr} a las {confirmationData.classTimeStr} hrs</div>
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

  const chosen = data.services.find(s => s.id === service);

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
                  onClick={() => setService(s.id)}
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
                    <small>
                      {isGroup ? `👥 Grupal · Cupo max: ${s.capacity || 10} alumnos` : '👤 Clase Individual'} · {s.description || s.mode}
                    </small>
                    {s.schedule && (
                      <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🕒</span>
                        <span>{s.schedule}</span>
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

          <div className="booking-step">
            <span>3</span>
            <div>
              <h2>Fecha, horario y tus datos</h2>
              <p>Los cupos se validan y aseguran inmediatamente.</p>
            </div>
          </div>

          <div className="form-grid public-contact">
            <label>Fecha
              <input name="date" type="date" min={new Date().toISOString().slice(0, 10)} required />
            </label>
            <label>Hora de la clase
              <div className="slots">
                {['08:00', '09:30', '11:00', '14:00', '16:00', '18:00', '19:30'].map(s => (
                  <button type="button" className={slot === s ? 'selected' : ''} onClick={() => setSlot(s)} key={s}>
                    {s}
                  </button>
                ))}
              </div>
            </label>
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

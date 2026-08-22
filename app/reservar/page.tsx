'use client';

import { useState } from 'react';

const services = [
  { name: 'Evaluación inicial', duration: '60 min', price: '$35.000', detail: 'Primera sesión para conocer tus necesidades.' },
  { name: 'Sesión de seguimiento', duration: '45 min', price: '$28.000', detail: 'Continuidad de tu proceso con objetivos claros.' },
  { name: 'Consulta online', duration: '45 min', price: '$25.000', detail: 'Atención por videollamada desde donde estés.' },
];
const people = [{ name: 'Sofía Martínez', role: 'Especialista', initials: 'SM' }, { name: 'Martín Reyes', role: 'Especialista', initials: 'MR' }];
const slots = ['09:00','10:30','12:00','15:30','17:00'];

export default function BookingPage() {
  const [service, setService] = useState(0);
  const [person, setPerson] = useState(0);
  const [slot, setSlot] = useState('');
  const [done, setDone] = useState(false);

  if (done) return <main className="booking-page"><section className="success-card"><span>✓</span><p className="eyebrow">RESERVA CONFIRMADA</p><h1>¡Tu hora quedó agendada!</h1><p>Te enviaremos la confirmación y el recordatorio antes de tu sesión.</p><div><strong>Jueves 27 de agosto · {slot}</strong><small>{services[service].name} con {people[person].name}</small></div><button onClick={() => setDone(false)}>Volver a la reserva</button></section></main>;

  return <main className="booking-page">
    <header className="booking-header"><a className="brand" href="/"><span className="brand-mark"><i/><i/><i/></span><span>Nexo</span></a><a href="/">Acceso negocio ↗</a></header>
    <div className="booking-wrap">
      <section className="business-card"><div className="business-cover"><span>EB</span></div><div><p className="eyebrow">RESERVA ONLINE</p><h1>Espacio Bienestar</h1><p>Atención personalizada para ayudarte a sentirte mejor.</p><ul><li>⌖ Providencia, Santiago</li><li>◷ Lun a vie · 09:00 a 19:00</li></ul></div></section>
      <section className="booking-flow">
        <div className="booking-step"><span>1</span><div><h2>Elige un servicio</h2><p>Selecciona la atención que necesitas.</p></div></div>
        <div className="service-list">{services.map((s,i)=><button key={s.name} className={service===i?'selected':''} onClick={()=>setService(i)}><i>{service===i?'✓':''}</i><div><strong>{s.name}</strong><small>{s.detail}</small><em>{s.duration}</em></div><b>{s.price}</b></button>)}</div>
        <div className="booking-step"><span>2</span><div><h2>Elige un profesional</h2><p>Escoge con quién quieres atenderte.</p></div></div>
        <div className="people-list">{people.map((p,i)=><button key={p.name} className={person===i?'selected':''} onClick={()=>setPerson(i)}><span>{p.initials}</span><div><strong>{p.name}</strong><small>{p.role}</small></div><i>{person===i?'✓':''}</i></button>)}</div>
        <div className="booking-step"><span>3</span><div><h2>Elige fecha y hora</h2><p>Horas disponibles para el jueves 27 de agosto.</p></div></div>
        <div className="date-strip"><button>‹</button>{['25 Mar','26 Mié','27 Jue','28 Vie','31 Lun'].map((d,i)=><button className={i===2?'selected':''} key={d}>{d}</button>)}<button>›</button></div>
        <div className="slots">{slots.map(s=><button className={slot===s?'selected':''} onClick={()=>setSlot(s)} key={s}>{s}</button>)}</div>
        <button className="confirm-booking" disabled={!slot} onClick={()=>setDone(true)}>Confirmar reserva · {services[service].price}</button>
        <p className="secure-note">🔒 Confirmación segura · Podrás cancelar según las políticas del negocio</p>
      </section>
    </div>
  </main>;
}

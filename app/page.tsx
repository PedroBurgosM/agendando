'use client';

import { useMemo, useState } from 'react';

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
            <button key={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item); demo(`${item}: módulo listo para conectar`); }}>
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

        <div className="content">
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
        </div>
      </section>
      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}

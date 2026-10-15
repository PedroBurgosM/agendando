'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';

export interface ProfileItem {
  userId: number;
  name: string;
  email: string;
  role: string;
  isSuperAdmin?: boolean;
  status: 'active' | 'inactive';
  isActive: boolean;
  createdAt: string;
  business: {
    id: number;
    name: string;
    slug: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    description?: string | null;
    timezone?: string;
    currency?: string;
  } | null;
  stats: {
    customersCount: number;
    servicesCount: number;
    bookingsCount: number;
  };
}

export function ProfilesModule({ demo }: { demo: (msg: string) => void }) {
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Modal Crear
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    slug: '',
    phone: '',
    address: '',
    createInstructor: false,
    createSampleData: false,
  });

  // Modal Éxito con Credenciales
  const [successCredentials, setSuccessCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    businessName: string;
    slug: string;
    bookingUrl: string;
  } | null>(null);

  // Modal Editar / Reset Password
  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    businessName: '',
    slug: '',
    phone: '',
    address: '',
    newPassword: '',
  });

  // Modal Confirmar Eliminar
  const [deletingProfile, setDeletingProfile] = useState<ProfileItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Generador de slug automático al escribir nombre de negocio
  function autoSlug(text: string) {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let res = '';
    for (let i = 0; i < 9; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }

  async function loadProfiles() {
    try {
      const res = await fetch('/api/admin/profiles', { cache: 'no-store' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as any;
        throw new Error(d.error || 'Error al obtener perfiles');
      }
      const data = (await res.json()) as any;
      setProfiles(data.profiles || []);
    } catch (err: any) {
      demo(err.message || 'Error al cargar perfiles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  function handleBusinessNameChange(name: string) {
    setCreateForm((prev) => ({
      ...prev,
      businessName: name,
      slug: prev.slug === '' || prev.slug === autoSlug(prev.businessName) ? autoSlug(name) : prev.slug,
    }));
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError('');

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo crear el cliente.');
      }

      setIsCreateOpen(false);
      setSuccessCredentials({
        name: createForm.name,
        email: data.credentials.email,
        password: data.credentials.password,
        businessName: data.credentials.businessName,
        slug: data.credentials.slug,
        bookingUrl: `${window.location.origin}/reservar?negocio=${data.credentials.slug}`,
      });

      setCreateForm({
        name: '',
        email: '',
        password: '',
        businessName: '',
        slug: '',
        phone: '',
        address: '',
        createInstructor: false,
        createSampleData: false,
      });

      demo('¡Cliente creado exitosamente!');
      void loadProfiles();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  function openEdit(profile: ProfileItem) {
    setEditingProfile(profile);
    setEditError('');
    setEditForm({
      name: profile.name,
      email: profile.email,
      businessName: profile.business?.name || '',
      slug: profile.business?.slug || '',
      phone: profile.business?.phone || '',
      address: profile.business?.address || '',
      newPassword: '',
    });
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingProfile) return;
    setEditLoading(true);
    setEditError('');

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingProfile.userId,
          name: editForm.name,
          email: editForm.email,
          businessName: editForm.businessName,
          slug: editForm.slug,
          phone: editForm.phone,
          address: editForm.address,
          password: editForm.newPassword || undefined,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'Error al actualizar perfil.');

      setEditingProfile(null);
      demo('Perfil actualizado correctamente.');
      void loadProfiles();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingProfile) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/admin/profiles?userId=${deletingProfile.userId}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el cliente.');

      setDeletingProfile(null);
      demo('Cliente y su espacio eliminados.');
      void loadProfiles();
    } catch (err: any) {
      demo(err.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleToggleStatus(profile: ProfileItem) {
    const isCurrentlyActive = profile.isActive;
    const actionLabel = isCurrentlyActive ? 'dar de baja' : 'reactivar';
    const confirmMessage = isCurrentlyActive
      ? `¿Estás seguro de dar de baja la cuenta de "${profile.name}"? El cliente no podrá iniciar sesión mientras esté dado de baja.`
      : `¿Deseas reactivar la cuenta de "${profile.name}"? El cliente podrá volver a iniciar sesión con sus credenciales habituales.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          action: 'toggle_status',
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'Error al cambiar estado.');

      demo(data.message || (isCurrentlyActive ? 'Cliente dado de baja.' : 'Cliente reactivado exitosamente.'));
      void loadProfiles();
    } catch (err: any) {
      demo(err.message);
    }
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    demo(`¡${label} copiado al portapapeles!`);
  }

  function copyWelcomeMessage(c: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    bookingUrl: string;
  }) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://agendando-mbbh.vercel.app';
    const msg = `👋 ¡Hola ${c.name}!

Ya está habilitado tu acceso exclusivo a tu sistema Agendando para "${c.businessName}":

🌐 Panel de Administración:
${origin}

👤 Usuario / Correo:
${c.email}

🔑 Contraseña de acceso:
${c.password}

-----------------------------
🔗 Tu Enlace de Reservas para tus Alumnos:
${c.bookingUrl}

(Tus alumnos podrán entrar directamente a ese link para ver tus clases y agendar sus cupos).

¡Cualquier duda quedo a tu disposición!`;

    navigator.clipboard.writeText(msg);
    demo('¡Mensaje de bienvenida copiado para WhatsApp!');
  }

  const filtered = useMemo(() => {
    let list = profiles;
    if (statusFilter === 'active') {
      list = list.filter((p) => p.isActive);
    } else if (statusFilter === 'inactive') {
      list = list.filter((p) => !p.isActive);
    }
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.business?.name || '').toLowerCase().includes(q) ||
        (p.business?.slug || '').toLowerCase().includes(q)
    );
  }, [profiles, search, statusFilter]);

  const totalClients = profiles.length;
  const activeClients = profiles.filter((p) => p.isActive).length;
  const inactiveClients = profiles.filter((p) => !p.isActive).length;
  const totalStudents = profiles.reduce((acc, p) => acc + (p.stats?.customersCount || 0), 0);
  const totalServices = profiles.reduce((acc, p) => acc + (p.stats?.servicesCount || 0), 0);

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Administrador de Perfiles y Clientes
            </h1>
            <span style={{
              background: '#ede9fe',
              color: '#6d28d9',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '20px',
              letterSpacing: '0.5px'
            }}>
              SUPER ADMIN
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0, maxWidth: '650px' }}>
            Crea cuentas independientes para cada uno de tus clientes (centros deportivos, academias, instructores particulares). Cada cliente tendrá su propio panel aislado y su link exclusivo de reservas.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setRefreshing(true); void loadProfiles(); }}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{refreshing ? '↻' : '↻'}</span>
            <span>{refreshing ? 'Actualizando…' : 'Refrescar'}</span>
          </button>

          <button
            onClick={() => {
              setCreateForm({
                name: '',
                email: '',
                password: generateRandomPassword(),
                businessName: '',
                slug: '',
                phone: '',
                address: '',
                createInstructor: false,
                createSampleData: false,
              });
              setCreateError('');
              setIsCreateOpen(true);
            }}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              background: '#7559f2',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(117, 89, 242, 0.25)'
            }}
          >
            <span>＋</span>
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Globales */}
      <div className="profiles-stats-grid">
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Clientes</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>{totalClients}</div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Negocios registrados</span>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clientes Activos</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a', marginTop: '6px' }}>{activeClients}</div>
          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>● Con acceso habilitado</span>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dados de Baja</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626', marginTop: '6px' }}>{inactiveClients}</div>
          <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 500 }}>● Acceso suspendido</span>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Alumnos en Plataforma</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>{totalStudents}</div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Suma de todos los clientes</span>
        </div>
      </div>

      {/* Barra de Filtros y Buscador */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: statusFilter === 'all' ? '#fff' : 'transparent',
              color: statusFilter === 'all' ? '#0f172a' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: statusFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Todos ({totalClients})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: statusFilter === 'active' ? '#fff' : 'transparent',
              color: statusFilter === 'active' ? '#16a34a' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: statusFilter === 'active' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Activos ({activeClients})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: statusFilter === 'inactive' ? '#fff' : 'transparent',
              color: statusFilter === 'inactive' ? '#dc2626' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: statusFilter === 'inactive' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Dados de baja ({inactiveClients})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: 0, width: '100%' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, empresa o correo…"
            style={{
              maxWidth: '320px',
              width: '100%',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              outline: 'none',
              background: '#fff'
            }}
          />
          <span style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          </span>
        </div>
      </div>

      {/* Lista de Clientes */}
      {loading ? (
        <div style={{ background: '#fff', padding: '48px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
          Cargando clientes y perfiles…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', padding: '48px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }}>No se encontraron clientes</h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
            {search || statusFilter !== 'all' ? 'Intenta ajustando los filtros o la búsqueda.' : 'Crea tu primer cliente para comenzar a darle acceso a Agendando.'}
          </p>
          {!search && statusFilter === 'all' && (
            <button
              onClick={() => setIsCreateOpen(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#7559f2',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              ＋ Crear Primer Cliente
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map((item) => {
            const bookingLink = item.business?.slug
              ? `${typeof window !== 'undefined' ? window.location.origin : ''}/reservar?negocio=${item.business.slug}`
              : null;

            return (
              <div
                key={item.userId}
                className="profile-client-card"
                style={{
                  background: item.isActive ? '#fff' : '#f8fafc',
                  opacity: item.isActive ? 1 : 0.88,
                }}
              >
                {/* Columna Izquierda: Información del Cliente */}
                <div className="profile-client-info">
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: item.isActive ? '#7559f2' : '#94a3b8',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '18px',
                      flexShrink: 0
                    }}
                  >
                    {item.name.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: item.isActive ? '#0f172a' : '#475569', margin: 0 }}>
                        {item.name}
                      </h3>
                      {item.isActive ? (
                        <span style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <span style={{ fontSize: '7px' }}>●</span> ACTIVO
                        </span>
                      ) : (
                        <span style={{
                          background: '#fee2e2',
                          color: '#b91c1c',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <span style={{ fontSize: '7px' }}>●</span> DADO DE BAJA
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <span>🏢 <strong>{item.business?.name || 'Sin negocio'}</strong></span>
                      <span>✉️ {item.email}</span>
                      {item.business?.phone && <span>📱 {item.business.phone}</span>}
                    </div>

                    {bookingLink && (
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Link de alumnos:</span>
                        <a
                          href={bookingLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '12px',
                            color: '#7559f2',
                            textDecoration: 'none',
                            fontWeight: 600,
                            background: '#f5f3ff',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>/reservar?negocio={item.business?.slug}</span>
                          <span>↗</span>
                        </a>
                        <button
                          onClick={() => copyText(bookingLink, 'Link de reservas')}
                          title="Copiar enlace de reservas"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px 4px' }}
                        >
                          📋
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Columna Central: Métricas */}
                <div className="profile-client-stats-col" style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '0 16px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{item.stats?.customersCount || 0}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Alumnos</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{item.stats?.servicesCount || 0}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Clases</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{item.stats?.bookingsCount || 0}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Reservas</div>
                  </div>
                </div>

                {/* Columna Derecha: Acciones */}
                <div className="profile-client-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : '';
                      const link = bookingLink || `${origin}/reservar`;
                      copyWelcomeMessage({
                        name: item.name,
                        email: item.email,
                        password: '(La contraseña asignada al crear o editar)',
                        businessName: item.business?.name || 'Agendando',
                        bookingUrl: link,
                      });
                    }}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Copiar mensaje de acceso para enviar por WhatsApp"
                  >
                    <span>💬</span>
                    <span>Copiar WhatsApp</span>
                  </button>

                  <button
                    onClick={() => openEdit(item)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>✏️</span>
                    <span>Editar</span>
                  </button>

                  <button
                    onClick={() => void handleToggleStatus(item)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: item.isActive ? '1px solid #fed7aa' : '1px solid #bbf7d0',
                      background: item.isActive ? '#fff7ed' : '#f0fdf4',
                      color: item.isActive ? '#c2410c' : '#15803d',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={item.isActive ? 'Dar de baja (suspender acceso)' : 'Reactivar acceso del cliente'}
                  >
                    <span>{item.isActive ? '🚫' : '✅'}</span>
                    <span>{item.isActive ? 'Dar de baja' : 'Reactivar'}</span>
                  </button>

                  {!item.isSuperAdmin && (
                    <button
                      onClick={() => setDeletingProfile(item)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid #fee2e2',
                        background: '#fff5f5',
                        color: '#dc2626',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                      title="Eliminar cliente definitivamente"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREAR NUEVO CLIENTE */}
      {/* ======================================================== */}
      {isCreateOpen && (
        <div className="profile-modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="profile-modal-card" style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Crear Nuevo Cliente / Espacio
                </h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                  Genera la cuenta de acceso y el espacio de trabajo para tu cliente.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="profile-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Nombre del Responsable *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Ej. Valeria Rojas"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Correo de Acceso (Usuario) *
                  </label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="valeria@danzaviva.cl"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    Contraseña de Acceso *
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, password: generateRandomPassword() })}
                    style={{ background: 'none', border: 'none', color: '#7559f2', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ⚡ Generar aleatoria
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Contraseña segura"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                <div className="profile-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Nombre del Negocio / Academia *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.businessName}
                      onChange={(e) => handleBusinessNameChange(e.target.value)}
                      placeholder="Ej. Academia Danza Viva"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Slug del Enlace (Alumnos) *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.slug}
                      onChange={(e) => setCreateForm({ ...createForm, slug: autoSlug(e.target.value) })}
                      placeholder="danzaviva"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  🔗 Su link de reservas será: <strong>/reservar?negocio={createForm.slug || 'nombre-negocio'}</strong>
                </div>
              </div>

              <div className="profile-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="+56 9 1234 5678"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Dirección o Comuna
                  </label>
                  <input
                    type="text"
                    value={createForm.address}
                    onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                    placeholder="Providencia, Santiago"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createForm.createInstructor}
                    onChange={(e) => setCreateForm({ ...createForm, createInstructor: e.target.checked })}
                  />
                  <span>Agregar al responsable como instructor en el equipo (opcional)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createForm.createSampleData}
                    onChange={(e) => setCreateForm({ ...createForm, createSampleData: e.target.checked })}
                  />
                  <span>Crear una clase inicial de bienvenida (opcional)</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: '#7559f2',
                    color: '#fff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {createLoading ? 'Creando cliente…' : 'Crear y Habilitar Acceso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREDENCIALES CREADAS (LISTAS PARA COMPARTIR) */}
      {/* ======================================================== */}
      {successCredentials && (
        <div className="profile-modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="profile-modal-card" style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            padding: '28px',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
              ¡Cliente Creado con Éxito!
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              Comparte estos datos con tu cliente para que empiece a utilizar Agendando.
            </p>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'left',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: '20px'
            }}>
              <div><strong>Negocio:</strong> {successCredentials.businessName}</div>
              <div><strong>Responsable:</strong> {successCredentials.name}</div>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                <div><strong>Usuario / Email:</strong> <code style={{ background: '#ede9fe', padding: '2px 6px', borderRadius: '4px', color: '#6d28d9' }}>{successCredentials.email}</code></div>
                <div style={{ marginTop: '4px' }}><strong>Contraseña:</strong> <code style={{ background: '#ede9fe', padding: '2px 6px', borderRadius: '4px', color: '#6d28d9' }}>{successCredentials.password}</code></div>
              </div>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                <strong>Link de reservas para sus alumnos:</strong>
                <div style={{ wordBreak: 'break-all', color: '#7559f2', fontSize: '12px' }}>{successCredentials.bookingUrl}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => copyWelcomeMessage(successCredentials)}
                style={{
                  padding: '11px',
                  borderRadius: '10px',
                  background: '#25D366',
                  color: '#fff',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>📲</span>
                <span>Copiar Mensaje Completo para WhatsApp</span>
              </button>

              <button
                onClick={() => setSuccessCredentials(null)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR CLIENTE / RESETEAR CONTRASEÑA */}
      {/* ======================================================== */}
      {editingProfile && (
        <div className="profile-modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="profile-modal-card" style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Editar Perfil / Cambiar Clave
                </h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                  Modifica los datos del cliente o restablece su contraseña.
                </p>
              </div>
              <button
                onClick={() => setEditingProfile(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nombre del Responsable
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Correo de Acceso
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nombre del Negocio / Centro
                </label>
                <input
                  type="text"
                  value={editForm.businessName}
                  onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div className="profile-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Slug de Reservas
                  </label>
                  <input
                    type="text"
                    value={editForm.slug}
                    onChange={(e) => setEditForm({ ...editForm, slug: autoSlug(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    Nueva Contraseña (dejar en blanco para no cambiar)
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, newPassword: generateRandomPassword() })}
                    style={{ background: 'none', border: 'none', color: '#7559f2', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ⚡ Generar nueva
                  </button>
                </div>
                <input
                  type="text"
                  value={editForm.newPassword}
                  onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                  placeholder="Escribe una nueva contraseña o pulsa generar"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: '#7559f2',
                    color: '#fff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {editLoading ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CONFIRMAR ELIMINAR */}
      {/* ======================================================== */}
      {deletingProfile && (
        <div className="profile-modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="profile-modal-card" style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            padding: '28px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
              ¿Eliminar cuenta de {deletingProfile.name}?
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>
              Esta acción eliminará la cuenta del cliente <strong>{deletingProfile.email}</strong> y todo su espacio asociado (clases, alumnos y reservas). Esta acción no se puede deshacer.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setDeletingProfile(null)}
                style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteConfirm}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {deleteLoading ? 'Eliminando…' : 'Sí, Eliminar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

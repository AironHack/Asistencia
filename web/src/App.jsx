import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconBuilding,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconDashboard,
  IconDownload,
  IconEdit,
  IconFileText,
  IconId,
  IconKey,
  IconLogout,
  IconPhoto,
  IconQrcode,
  IconRefresh,
  IconReportAnalytics,
  IconSettings,
  IconShieldCheck,
  IconTrash,
  IconUser,
  IconUsers
} from '@tabler/icons-react';
import { api, configurarAuth } from './services/api.js';

const vistasPorRol = {
  admin: ['inicio', 'registro', 'personal', 'usuarios', 'turnos', 'solicitudes', 'reportes', 'configuracion', 'auditoria', 'portal'],
  supervisor: ['inicio', 'personal', 'solicitudes', 'reportes', 'portal'],
  vigilante: ['registro', 'portal'],
  trabajador: ['portal']
};

const menu = {
  inicio: ['Inicio', IconDashboard],
  registro: ['Registrar', IconQrcode],
  personal: ['Personal', IconId],
  usuarios: ['Usuarios', IconUsers],
  turnos: ['Turnos', IconCalendarTime],
  solicitudes: ['Solicitudes', IconFileText],
  reportes: ['Reportes', IconReportAnalytics],
  configuracion: ['Configuracion', IconSettings],
  auditoria: ['Auditoria', IconShieldCheck],
  portal: ['Mi portal', IconId]
};

const inicial = {
  salud: null,
  asistenciasHoy: [],
  trabajadores: [],
  usuarios: [],
  turnos: [],
  asignaciones: [],
  areas: [],
  cargos: [],
  solicitudes: [],
  tipos: [],
  misSolicitudes: [],
  misAsistencias: [],
  reporte: [],
  auditoria: [],
  configuraciones: [],
  qr: null,
  qrDataUrl: ''
};

function mensajeAmigable(error) {
  const mensaje = String(error?.message || 'Ocurrio un problema');

  if (error?.status === 0 || /Failed to fetch|NetworkError|backend/i.test(mensaje)) {
    return 'No se pudo conectar con el backend. Inicia la API con node src/index.js y verifica http://localhost:3000/api/salud.';
  }

  if (error?.status === 401) return 'Tu sesion vencio o no has iniciado sesion. Vuelve a ingresar.';
  if (error?.status === 403) return 'No tienes permiso para realizar esta accion con tu rol actual.';
  if (error?.status === 404) return 'No se encontro la informacion solicitada. Actualiza la pantalla e intenta de nuevo.';
  if (error?.status === 409 || /duplicada|ya tiene entrada y salida|ya existe/i.test(mensaje)) {
    return 'Esa accion ya fue registrada. Actualiza la pantalla para ver el estado actual.';
  }
  if (error?.status === 428 || /requiere verificacion facial|Falta verificacion facial/i.test(mensaje)) {
    return 'Este fotocheck necesita verificacion facial. Escanea el QR, verifica el rostro y luego registra.';
  }
  if (/camara|camera|Permission denied|NotAllowedError|NotFoundError|HTTPS|localhost/i.test(mensaje)) {
    return 'No se pudo usar la camara. Abre la web en localhost o HTTPS, revisa permisos del navegador y selecciona una camara disponible.';
  }
  if (/QR|payload|firma|token/i.test(mensaje)) {
    return 'El QR no es valido o no corresponde a este sistema. Genera nuevamente el fotocheck desde Personal.';
  }
  if (/rostro|facial|coincidencia/i.test(mensaje)) {
    return 'No se pudo confirmar el rostro. Revisa luz/camara o vuelve a capturar el rostro base desde Personal.';
  }

  return mensaje;
}

function showError(error) {
  notifications.show({
    color: 'red',
    title: 'No se pudo completar',
    message: mensajeAmigable(error)
  });
}

function showOk(message) {
  notifications.show({ color: 'green', title: 'Listo', message, icon: <IconCheck size={18} /> });
}

function sonarMarcacionExitosa() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audio = new AudioContext();
    const volumen = audio.createGain();
    volumen.gain.setValueAtTime(0.0001, audio.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.28);
    volumen.connect(audio.destination);

    [880, 1175].forEach((frecuencia, index) => {
      const tono = audio.createOscillator();
      tono.type = 'sine';
      tono.frequency.setValueAtTime(frecuencia, audio.currentTime + (index * 0.1));
      tono.connect(volumen);
      tono.start(audio.currentTime + (index * 0.1));
      tono.stop(audio.currentTime + 0.26 + (index * 0.1));
    });

    setTimeout(() => audio.close().catch(() => {}), 600);
  } catch {}
}

function fechaHora(valor) {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function fechaHoraSql(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

function hoy() {
  const fecha = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function estadoCamara() {
  return {
    ok: window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia),
    urlActual: window.location.href,
    urlSegura: `https://${window.location.host}`
  };
}

function useFormState(defaults) {
  const [values, setValues] = useState(defaults);
  const set = (field) => (eventOrValue) => {
    const value = eventOrValue?.target ? eventOrValue.target.value : eventOrValue;
    setValues((current) => ({ ...current, [field]: value }));
  };
  const reset = () => setValues(defaults);
  return [values, set, reset, setValues];
}

function FieldSelect({ data, value, onChange, placeholder = 'Seleccionar', ...props }) {
  return <Select data={data} value={value ? String(value) : null} onChange={onChange} placeholder={placeholder} searchable clearable {...props} />;
}

function estaActivo(valor) {
  return valor === true || valor === 1 || valor === '1';
}

function colorSolicitud(estado) {
  if (estado === 'aprobada') return 'green';
  if (estado === 'rechazada') return 'red';
  return 'yellow';
}

function colorAsistencia(estado) {
  if (estado === 'puntual' || estado === 'presente') return 'green';
  if (estado === 'tardanza') return 'yellow';
  if (estado === 'ausente') return 'red';
  return 'blue';
}

function tipoConfiguracion(clave, valor) {
  if (typeof valor === 'boolean') return 'boolean';
  if (typeof valor === 'number') return 'number';
  if (clave.includes('minutos') || clave.includes('umbral') || clave.includes('confianza')) return 'number';
  return 'text';
}

function etiquetaConfiguracion(clave) {
  const nombres = {
    nombre_empresa: 'Nombre de empresa',
    logo_empresa_url: 'Logo de empresa',
    eslogan_empresa: 'Eslogan',
    zona_horaria: 'Zona horaria',
    tolerancia_global_minutos: 'Tolerancia global',
    reconocimiento_facial_activo: 'Reconocimiento facial',
    confianza_facial_minima: 'Confianza facial minima',
    umbral_minutos_tardanza_alerta: 'Alerta por tardanza',
    qr_fotocheck_requiere_facial: 'QR requiere rostro'
  };
  return nombres[clave] || clave.replaceAll('_', ' ');
}

function usePaginacion(filas, tamano = 10) {
  const [pagina, setPagina] = useState(1);
  const total = Math.max(1, Math.ceil(filas.length / tamano));
  useEffect(() => {
    if (pagina > total) setPagina(total);
  }, [pagina, total]);
  const inicio = (pagina - 1) * tamano;
  return {
    pagina,
    setPagina,
    total,
    filas: filas.slice(inicio, inicio + tamano),
    desde: filas.length ? inicio + 1 : 0,
    hasta: Math.min(inicio + tamano, filas.length)
  };
}

function Paginador({ paginacion, totalItems }) {
  if (totalItems <= 10) return null;
  return (
    <Group justify="space-between" mt="md" className="table-pager">
      <Text size="sm" c="dimmed">
        Mostrando {paginacion.desde}-{paginacion.hasta} de {totalItems}
      </Text>
      <Pagination total={paginacion.total} value={paginacion.pagina} onChange={paginacion.setPagina} size="sm" />
    </Group>
  );
}

function valorConfig(configuraciones, clave, fallback = '') {
  const item = configuraciones.find((config) => config.clave === clave);
  return item?.valor ?? fallback;
}

function descargarArchivo(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  link.click();
  URL.revokeObjectURL(url);
}

function descargarCsv(nombre, filas) {
  if (!filas.length) {
    showError(new Error('No hay datos para exportar.'));
    return;
  }
  const columnas = Object.keys(filas[0]);
  const csv = [
    columnas.join(','),
    ...filas.map((fila) => columnas.map((columna) => `"${String(fila[columna] ?? '').replaceAll('"', '""')}"`).join(','))
  ].join('\n');
  descargarArchivo(nombre, csv, 'text/csv;charset=utf-8');
}

async function crearQrDataUrl(contenido, opciones = {}) {
  const modulo = await import('qrcode');
  const QRCode = modulo.default || modulo;
  return QRCode.toDataURL(contenido, opciones);
}

function imprimirTabla(titulo, filas) {
  if (!filas.length) {
    showError(new Error('No hay datos para imprimir.'));
    return;
  }
  const columnas = Object.keys(filas[0]);
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${titulo}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d1d5db;padding:7px;text-align:left}th{background:#eff6ff}</style>
    </head><body><h1>${titulo}</h1><p>Generado: ${new Date().toLocaleString('es-PE')}</p><table><thead><tr>${columnas.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.map((fila) => `<tr>${columnas.map((c) => `<td>${fila[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
  const ventana = window.open('', '_blank');
  if (!ventana) {
    showError(new Error('El navegador bloqueo la ventana emergente.'));
    return;
  }
  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}

function extraerMarcoCuadrado(origen, tamano = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = tamano;
  canvas.height = tamano;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const ancho = origen.videoWidth || origen.naturalWidth || origen.width || tamano;
  const alto = origen.videoHeight || origen.naturalHeight || origen.height || tamano;
  const lado = Math.min(ancho, alto);
  const sx = (ancho - lado) / 2;
  const sy = (alto - lado) / 2;
  ctx.drawImage(origen, sx, sy, lado, lado, 0, 0, tamano, tamano);
  return { data: ctx.getImageData(0, 0, tamano, tamano).data, tamano };
}

function descriptorDesdeImagen(origen) {
  const { data, tamano } = extraerMarcoCuadrado(origen, 24);
  const grises = [];
  const descriptor = [];

  for (let i = 0; i < data.length; i += 4) {
    grises.push(((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114)) / 255);
  }

  const promedio = grises.reduce((suma, valor) => suma + valor, 0) / grises.length;
  const varianza = grises.reduce((suma, valor) => suma + ((valor - promedio) ** 2), 0) / grises.length;
  const desviacion = Math.sqrt(varianza) || 1;

  for (const gris of grises) {
    const normalizado = Math.max(0, Math.min(1, ((gris - promedio) / (desviacion * 3)) + 0.5));
    descriptor.push(Number(normalizado.toFixed(4)));
  }

  for (let y = 1; y < tamano - 1; y += 1) {
    for (let x = 1; x < tamano - 1; x += 1) {
      if (x % 3 !== 0 || y % 3 !== 0) continue;
      const centro = y * tamano + x;
      const horizontal = Math.abs(grises[centro - 1] - grises[centro + 1]);
      const vertical = Math.abs(grises[centro - tamano] - grises[centro + tamano]);
      descriptor.push(Number(Math.min(1, (horizontal + vertical) * 2).toFixed(4)));
    }
  }

  const bloques = 4;
  const bloqueTamano = tamano / bloques;
  for (let by = 0; by < bloques; by += 1) {
    for (let bx = 0; bx < bloques; bx += 1) {
      let suma = 0;
      let total = 0;
      for (let y = by * bloqueTamano; y < (by + 1) * bloqueTamano; y += 1) {
        for (let x = bx * bloqueTamano; x < (bx + 1) * bloqueTamano; x += 1) {
          suma += grises[y * tamano + x];
          total += 1;
        }
      }
      descriptor.push(Number((suma / total).toFixed(4)));
    }
  }

  return descriptor;
}

function descriptorDesdeVideo(video) {
  return descriptorDesdeImagen(video);
}

function fotoDesdeVideo(video) {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 360;
  const contexto = canvas.getContext('2d');
  const ancho = video.videoWidth || 360;
  const alto = video.videoHeight || 360;
  const lado = Math.min(ancho, alto);
  const sx = (ancho - lado) / 2;
  const sy = (alto - lado) / 2;
  contexto.drawImage(video, sx, sy, lado, lado, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken') || '');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken') || '');
  const [vista, setVista] = useState('inicio');
  const [datos, setDatos] = useState(inicial);
  const [cargando, setCargando] = useState(false);

  configurarAuth({
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setAccessToken: (token) => {
      setAccessToken(token);
      localStorage.setItem('accessToken', token);
    },
    onUnauthorized: () => cerrarSesion(false)
  });

  function cerrarSesion(llamarApi = true) {
    if (llamarApi && accessToken) api.post('/auth/logout', {}).catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUsuario(null);
    setAccessToken('');
    setRefreshToken('');
    setVista('inicio');
  }

  async function cargarTodo(forzar = false) {
    if (!usuario && !forzar) return;
    setCargando(true);
    try {
      const sesion = accessToken
        ? await api.get('/auth/me').catch(() => ({ usuario }))
        : { usuario };
      const usuarioCarga = sesion.usuario || usuario;
      if (usuarioCarga?.id_usuario) {
        setUsuario(usuarioCarga);
      }

      const rol = usuarioCarga?.rol;
      const nuevo = { ...datos };
      nuevo.salud = await api.get('/salud');
      const configuracionPublica = await api.get('/configuracion/publica').catch(() => ({ configuraciones: [] }));
      nuevo.configuraciones = configuracionPublica.configuraciones || nuevo.configuraciones || [];

      if (['admin', 'supervisor', 'vigilante'].includes(rol)) {
        const [asistencias, trabajadores] = await Promise.all([
          api.get('/asistencias/hoy'),
          api.get(`/trabajadores${rol === 'admin' ? '' : '?estado=activo'}`)
        ]);
        nuevo.asistenciasHoy = asistencias.asistencias || [];
        nuevo.trabajadores = trabajadores.trabajadores || [];
      }

      if (['admin', 'supervisor'].includes(rol)) {
        const [catalogos, solicitudes] = await Promise.all([
          api.get(`/trabajadores/catalogos/base${rol === 'admin' ? '?incluir_inactivos=true' : ''}`),
          api.get('/solicitudes')
        ]);
        nuevo.areas = catalogos.areas || [];
        nuevo.cargos = catalogos.cargos || [];
        nuevo.solicitudes = solicitudes.solicitudes || [];
      }

      if (rol === 'admin') {
        const [usuarios, turnos, asignaciones, configuraciones, auditoria] = await Promise.all([
          api.get('/usuarios'),
          api.get('/turnos'),
          api.get('/turnos/asignaciones/listado'),
          api.get('/configuracion'),
          api.get('/auditoria?limite=100')
        ]);
        nuevo.usuarios = usuarios.usuarios || [];
        nuevo.turnos = turnos.turnos || [];
        nuevo.asignaciones = asignaciones.asignaciones || [];
        nuevo.configuraciones = configuraciones.configuraciones || [];
        nuevo.auditoria = auditoria.auditoria || [];
      }

      if (rol === 'admin' || usuario?.id_trabajador) {
        const [tipos, mias] = await Promise.all([
          api.get('/solicitudes/tipos'),
          usuario?.id_trabajador
            ? api.get('/solicitudes/mias').catch(() => ({ solicitudes: [] }))
            : Promise.resolve({ solicitudes: [] })
        ]);
        nuevo.tipos = tipos.tipos || [];
        nuevo.misSolicitudes = mias.solicitudes || [];
        if (usuarioCarga?.id_trabajador) {
          const [mis, trabajador] = await Promise.all([
            api.get(`/asistencias/trabajador/${usuarioCarga.id_trabajador}`),
            api.get(`/trabajadores/${usuarioCarga.id_trabajador}`).catch(() => ({ trabajador: null }))
          ]);
          nuevo.misAsistencias = mis.asistencias || [];
          if (trabajador.trabajador) {
            nuevo.trabajadores = [trabajador.trabajador];
          }
        }
      }

      setDatos(nuevo);
    } catch (error) {
      showError(error);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    api.get('/auth/me', accessToken)
      .then((respuesta) => {
        setUsuario(respuesta.usuario);
        const permitidas = vistasPorRol[respuesta.usuario.rol] || ['inicio'];
        setVista(permitidas[0]);
      })
      .catch(() => cerrarSesion(false));
  }, []);

  useEffect(() => {
    if (usuario) cargarTodo(true);
  }, [usuario?.id_usuario]);

  if (!usuario) {
    return <Login onLogin={(respuesta) => {
      setUsuario(respuesta.usuario);
      setAccessToken(respuesta.accessToken);
      setRefreshToken(respuesta.refreshToken || '');
      localStorage.setItem('accessToken', respuesta.accessToken);
      localStorage.setItem('refreshToken', respuesta.refreshToken || '');
      setVista((vistasPorRol[respuesta.usuario.rol] || ['inicio'])[0]);
    }} />;
  }

  const vistas = vistasPorRol[usuario.rol] || ['inicio'];
  const [titulo] = menu[vista] || ['Inicio'];

  return (
    <div className="shell">
      <aside className="sidebar">
        <Stack gap="lg">
          <Group>
            <ThemeIcon size={44} radius="md"><IconShieldCheck size={24} /></ThemeIcon>
            <div>
              <Title order={3}>Asistencias</Title>
              <Text size="sm" c="dimmed">Panel de control</Text>
            </div>
          </Group>

          <Stack gap={6}>
            {vistas.map((id) => {
              const [label, Icon] = menu[id];
              return (
                <Button
                  key={id}
                  variant={vista === id ? 'light' : 'subtle'}
                  color={vista === id ? 'blue' : 'gray'}
                  justify="flex-start"
                  leftSection={<Icon size={18} />}
                  onClick={() => setVista(id)}
                >
                  {label}
                </Button>
              );
            })}
          </Stack>

          <Divider />
          <Stack gap={4}>
            <Text fw={700}>{usuario.nombre_completo}</Text>
            <Badge variant="light">{usuario.rol}</Badge>
          </Stack>
          <Button variant="light" color="red" leftSection={<IconLogout size={18} />} onClick={() => cerrarSesion()}>
            Cerrar sesion
          </Button>
        </Stack>
      </aside>

      <main className="main">
        <div className="page-head">
          <div>
            <Title order={1}>{titulo}</Title>
            <Text c="dimmed">Acciones simples para operar el sistema sin complicaciones.</Text>
          </div>
          <ActionIcon size="lg" variant="light" onClick={() => cargarTodo(true)} loading={cargando}>
            <IconRefresh size={20} />
          </ActionIcon>
        </div>
        <Contenido vista={vista} setVista={setVista} usuario={usuario} setUsuario={setUsuario} datos={datos} setDatos={setDatos} recargar={() => cargarTodo(true)} />
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [values, set] = useFormState({ usuario: 'admin', contrasena: 'admin123' });
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const respuesta = await api.post('/auth/login', values);
      onLogin(respuesta);
      showOk('Bienvenido al sistema.');
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg">
      <form className="login-frame" onSubmit={submit}>
        <div className="login-avatar">
          <IconUser size={54} stroke={1.7} />
        </div>
        <Text className="login-title">Inicia sesion</Text>
        <Text className="login-subtitle">Sistema de control de asistencia</Text>

        <Stack gap={14} mt={26}>
          <div className="login-field">
            <div className="login-field-icon"><IconUser size={25} /></div>
            <input
              value={values.usuario}
              onChange={set('usuario')}
              placeholder="Usuario"
              autoComplete="username"
              required
            />
          </div>

          <div className="login-field">
            <div className="login-field-icon"><IconKey size={25} /></div>
            <input
              value={values.contrasena}
              onChange={set('contrasena')}
              placeholder="Contrasena"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <Group justify="space-between" className="login-options">
            <label><input type="checkbox" defaultChecked /> Recordarme</label>
            <span>Recuperar acceso</span>
          </Group>

          <Button className="login-button" type="submit" loading={loading} fullWidth>
            INGRESAR
          </Button>

          <Text size="xs" c="dimmed" ta="center">API: {api.baseUrl}</Text>
        </Stack>
      </form>
    </div>
  );
}

function Contenido(props) {
  const { vista } = props;
  if (vista === 'registro') return <Registro {...props} />;
  if (vista === 'personal') return <Personal {...props} />;
  if (vista === 'usuarios') return <Usuarios {...props} />;
  if (vista === 'turnos') return <Turnos {...props} />;
  if (vista === 'solicitudes') return <Solicitudes {...props} />;
  if (vista === 'reportes') return <Reportes {...props} />;
  if (vista === 'configuracion') return <Configuracion {...props} />;
  if (vista === 'auditoria') return <Auditoria {...props} />;
  if (vista === 'portal') return <Portal {...props} />;
  return <Inicio {...props} />;
}

function Inicio({ datos, setVista, usuario }) {
  const total = datos.asistenciasHoy.length;
  const tardanzas = datos.asistenciasHoy.filter((x) => x.estado === 'tardanza').length;
  const presentes = datos.asistenciasHoy.filter((x) => x.hora_entrada).length;
  const ausentes = Math.max(0, total - presentes);
  const pendientesSalida = datos.asistenciasHoy.filter((x) => x.hora_entrada && !x.hora_salida).length;
  const pendientes = datos.solicitudes.filter((x) => x.estado === 'pendiente').length;
  const porcentaje = total ? Math.round((presentes / total) * 100) : 0;
  const incidencias = datos.asistenciasHoy
    .filter((x) => x.estado === 'tardanza' || !x.hora_entrada || (x.hora_entrada && !x.hora_salida))
    .slice(0, 8);
  const solicitudesPendientes = datos.solicitudes
    .filter((x) => x.estado === 'pendiente')
    .slice(0, 5);
  const mensaje = ausentes > 0
    ? `Hoy asistieron ${presentes} de ${total}. Faltan ${ausentes} por registrar entrada.`
    : tardanzas > 0
      ? `Todos registraron entrada, pero hay ${tardanzas} tardanza(s) por revisar.`
      : `Todo normal: ${presentes} trabajador(es) registraron asistencia.`;

  return (
    <Stack>
      <div className="metric-grid">
        <Metric label="Trabajadores" value={total} icon={IconUsers} />
        <Metric label="Presentes hoy" value={presentes} icon={IconCheck} color="green" />
        <Metric label="Ausentes" value={ausentes} icon={IconAlertTriangle} color="red" />
        <Metric label="Tardanzas" value={tardanzas} icon={IconClock} color="yellow" />
        <Metric label="Solicitudes" value={pendientes} icon={IconFileText} color="grape" />
      </div>

      <Card withBorder className="today-card">
        <Group justify="space-between" align="flex-start">
          <div>
            <Badge variant="light" mb="xs">Estado del dia</Badge>
            <Title order={3}>{mensaje}</Title>
            <Text c="dimmed" mt={6}>
              {pendientesSalida} trabajador(es) aun no registran salida. {pendientes} solicitud(es) esperan revision.
            </Text>
          </div>
          <ThemeIcon size={56} radius="xl" color={ausentes || tardanzas ? 'yellow' : 'green'} variant="light">
            {ausentes || tardanzas ? <IconAlertTriangle size={30} /> : <IconCheck size={30} />}
          </ThemeIcon>
        </Group>
        <div className="attendance-bar" aria-label="Porcentaje de asistencia">
          <span style={{ width: `${porcentaje}%` }} />
        </div>
        <Group justify="space-between" mt={8}>
          <Text size="sm" c="dimmed">Avance de asistencia</Text>
          <Text size="sm" fw={800}>{porcentaje}%</Text>
        </Group>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 4 }}>
        {['admin', 'vigilante'].includes(usuario.rol) && <Button size="md" leftSection={<IconQrcode size={18} />} onClick={() => setVista('registro')}>Registrar asistencia</Button>}
        {usuario.rol === 'admin' && <Button size="md" variant="light" leftSection={<IconId size={18} />} onClick={() => setVista('personal')}>Agregar trabajador</Button>}
        {['admin', 'supervisor'].includes(usuario.rol) && <Button size="md" variant="light" leftSection={<IconFileText size={18} />} onClick={() => setVista('solicitudes')}>Revisar solicitudes</Button>}
        {['admin', 'supervisor'].includes(usuario.rol) && <Button size="md" variant="light" leftSection={<IconReportAnalytics size={18} />} onClick={() => setVista('reportes')}>Ver reportes</Button>}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3}>Incidencias de hoy</Title>
            <Badge color={incidencias.length ? 'yellow' : 'green'}>{incidencias.length}</Badge>
          </Group>
          <Stack gap="xs">
            {incidencias.length ? incidencias.map((x) => (
              <Paper key={x.id_trabajador} withBorder p="sm">
                <Group justify="space-between">
                  <div>
                    <Text fw={700}>{x.nombre_completo}</Text>
                    <Text size="sm" c="dimmed">{x.area} - {x.estado === 'tardanza' ? `${x.minutos_tardanza} min tarde` : !x.hora_entrada ? 'Sin entrada' : 'Pendiente de salida'}</Text>
                  </div>
                  <Badge color={x.estado === 'tardanza' ? 'yellow' : !x.hora_entrada ? 'red' : 'blue'}>{x.estado === 'tardanza' ? 'Tardanza' : !x.hora_entrada ? 'Ausente' : 'Salida'}</Badge>
                </Group>
              </Paper>
            )) : <Text c="dimmed">Sin incidencias por ahora.</Text>}
          </Stack>
        </Card>

        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3}>Solicitudes pendientes</Title>
            <Button size="xs" variant="subtle" onClick={() => setVista('solicitudes')}>Ver todas</Button>
          </Group>
          <Stack gap="xs">
            {solicitudesPendientes.length ? solicitudesPendientes.map((s) => (
              <Paper key={s.id_solicitud} withBorder p="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={700}>{s.trabajador}</Text>
                    <Text size="sm" c="dimmed">{s.tipo} - {s.fecha_solicitud}</Text>
                  </div>
                  <Badge>{s.estado}</Badge>
                </Group>
              </Paper>
            )) : <Text c="dimmed">No hay solicitudes pendientes.</Text>}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Group justify="space-between" mb="md">
          <Title order={3}>Asistencia de hoy</Title>
          <Badge>{hoy()}</Badge>
        </Group>
        <TablaAsistencia filas={datos.asistenciasHoy} />
      </Card>
    </Stack>
  );
}

function Metric({ label, value, icon: Icon, color = 'blue' }) {
  return (
    <Paper withBorder p="md" radius="lg">
      <Group justify="space-between">
        <div>
          <Text size="sm" c="dimmed">{label}</Text>
          <Title order={2}>{value}</Title>
        </div>
        <ThemeIcon color={color} variant="light" size={46}><Icon size={24} /></ThemeIcon>
      </Group>
    </Paper>
  );
}

function Registro({ datos, setDatos, recargar, usuario }) {
  const [manual, setManual] = useState('');
  const [qrTexto, setQrTexto] = useState('');
  const [qrPendiente, setQrPendiente] = useState(null);
  const [facialVerificado, setFacialVerificado] = useState(false);
  const [facialCoincidencia, setFacialCoincidencia] = useState(null);
  const [facialMensaje, setFacialMensaje] = useState('Selecciona un trabajador e inicia la camara facial.');
  const [facialActivo, setFacialActivo] = useState(false);
  const [scannerActivo, setScannerActivo] = useState(false);
  const [scannerIniciando, setScannerIniciando] = useState(false);
  const [camaras, setCamaras] = useState([]);
  const [camaraSeleccionada, setCamaraSeleccionada] = useState('');
  const [correccion, setCorreccion] = useState(null);
  const lectorQrRef = useRef(null);
  const html5QrRef = useRef(null);
  const videoFacialRef = useRef(null);
  const streamFacialRef = useRef(null);
  const camara = estadoCamara();
  const trabajadores = datos.trabajadores.map((t) => ({ value: String(t.id_trabajador), label: `${t.nombre_completo} - ${t.dni}` }));
  const seleccionado = datos.asistenciasHoy.find((x) => Number(x.id_trabajador) === Number(manual));
  const pendientesEntrada = datos.asistenciasHoy.filter((x) => !x.hora_entrada).length;
  const pendientesSalida = datos.asistenciasHoy.filter((x) => x.hora_entrada && !x.hora_salida).length;
  const registrados = datos.asistenciasHoy.filter((x) => x.hora_entrada).length;
  const esAdmin = usuario?.rol === 'admin';
  const puedeRegistroManual = ['admin', 'vigilante'].includes(usuario?.rol);
  const accionSugerida = !seleccionado
    ? 'Selecciona un trabajador para ver su estado.'
    : !seleccionado.hora_entrada
      ? 'Debe registrar ENTRADA.'
      : !seleccionado.hora_salida
        ? 'Debe registrar SALIDA.'
        : 'Ya tiene entrada y salida registradas hoy.';

  async function obtenerHtml5Qr() {
    if (!html5QrRef.current) {
      const modulo = await import('html5-qrcode');
      html5QrRef.current = modulo.Html5Qrcode;
    }
    return html5QrRef.current;
  }

  async function registrarManual() {
    try {
      await api.post('/asistencias/registrar-manual', { id_trabajador: Number(manual), informacion_dispositivo: { origen_web: true } });
      sonarMarcacionExitosa();
      showOk('Asistencia registrada.');
      setManual('');
      setFacialVerificado(false);
      setFacialCoincidencia(null);
      recargar();
    } catch (error) {
      showError(error);
    }
  }

  function prepararQr(qr) {
    const idTrabajador = qr?.payload?.id_trabajador;
    if (!idTrabajador) throw new Error('El QR no contiene trabajador valido.');
    setQrTexto(JSON.stringify(qr, null, 2));
    setManual(String(idTrabajador));
  }

  async function registrarQr() {
    try {
      const qr = qrPendiente || JSON.parse(qrTexto);
      prepararQr(qr);
      await api.post('/asistencias/registrar-qr', {
        qr,
        informacion_dispositivo: { origen_web: true, modo: qrPendiente ? 'qr_camara' : 'texto_qr' }
      });
      sonarMarcacionExitosa();
      showOk('Asistencia registrada por QR.');
      setQrTexto('');
      setQrPendiente(null);
      setManual('');
      setFacialVerificado(false);
      setFacialCoincidencia(null);
      recargar();
    } catch (error) {
      showError(error);
    }
  }

  async function registrarQrObjeto(qr) {
    setQrPendiente(qr);
    setQrTexto(JSON.stringify(qr, null, 2));
    await registrarQrDirecto(qr);
  }

  async function registrarQrDirecto(qr) {
    await api.post('/asistencias/registrar-qr', {
      qr,
      informacion_dispositivo: { origen_web: true, modo: 'camara_qr' }
    });
    sonarMarcacionExitosa();
    showOk('Asistencia registrada por QR.');
    setQrTexto('');
    setQrPendiente(null);
    setManual('');
    setFacialVerificado(false);
    setFacialCoincidencia(null);
    recargar();
  }

  async function iniciarCamaraQr() {
    try {
      if (!camara.ok) throw new Error('La camara requiere HTTPS o abrir la web en localhost.');
      if (scannerActivo || scannerIniciando) return;
      setScannerIniciando(true);

      const Html5Qrcode = await obtenerHtml5Qr();
      const listaCamaras = camaras.length ? camaras : await Html5Qrcode.getCameras();
      if (!listaCamaras.length) {
        throw new Error('No se encontro una camara disponible en este equipo.');
      }

      const camaraPreferida = listaCamaras.find((item) => item.id === camaraSeleccionada)
        || listaCamaras.find((item) => /back|rear|environment|trasera/i.test(item.label))
        || listaCamaras[0];
      setCamaraSeleccionada(camaraPreferida.id);
      const lector = new Html5Qrcode('qr-reader');
      lectorQrRef.current = lector;

      await lector.start(
        camaraPreferida.id,
        { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1.777 },
        async (texto) => {
          try {
            await detenerCamaraQr();
            const qr = JSON.parse(texto);
            await registrarQrObjeto(qr);
          } catch (error) {
            showError(error);
          }
        }
      );
      setScannerActivo(true);
      showOk('Camara activa. Apunta al QR.');
    } catch (error) {
      setScannerActivo(false);
      lectorQrRef.current = null;
      showError(error);
    } finally {
      setScannerIniciando(false);
    }
  }

  async function detenerCamaraQr() {
    const lector = lectorQrRef.current;
    if (!lector) return;
    try {
      await lector.stop();
      lector.clear();
    } catch {}
    lectorQrRef.current = null;
    setScannerActivo(false);
  }

  async function iniciarFacialManual() {
    try {
      if (!camara.ok) throw new Error('La camara requiere HTTPS o abrir la web en localhost.');
      if (!manual) throw new Error('Selecciona un trabajador antes de iniciar la verificacion facial.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamFacialRef.current = stream;
      if (videoFacialRef.current) {
        videoFacialRef.current.srcObject = stream;
        await videoFacialRef.current.play();
      }
      setFacialActivo(true);
      setFacialMensaje('Camara facial activa. Ubica el rostro dentro del cuadro y presiona Verificar rostro.');
    } catch (error) {
      showError(error);
    }
  }

  function detenerFacialManual() {
    streamFacialRef.current?.getTracks().forEach((track) => track.stop());
    streamFacialRef.current = null;
    if (videoFacialRef.current) videoFacialRef.current.srcObject = null;
    setFacialActivo(false);
  }

  async function verificarRostroManual() {
    try {
      if (!manual) throw new Error('Selecciona un trabajador.');
      if (!videoFacialRef.current || !facialActivo) throw new Error('Inicia la camara facial.');
      const descriptor = descriptorDesdeVideo(videoFacialRef.current);
      const respuesta = await api.post('/facial/buscar', { descriptor });
      const mejor = (respuesta.candidatos || [])[0];
      if (!mejor) {
        setFacialVerificado(false);
        setFacialMensaje('No se encontro coincidencia facial. Revisa que el admin haya capturado el rostro base.');
        throw new Error('No se encontro coincidencia facial.');
      }
      if (Number(mejor.id_trabajador) !== Number(manual)) {
        setFacialVerificado(false);
        setFacialMensaje(`El rostro parece pertenecer a ${mejor.nombre_completo}, no al trabajador seleccionado.`);
        throw new Error('El rostro no coincide con el trabajador seleccionado.');
      }
      setFacialVerificado(true);
      setFacialCoincidencia({
        id_trabajador: mejor.id_trabajador,
        nombre_completo: mejor.nombre_completo,
        confianza: Number(mejor.confianza || 0)
      });
      setFacialMensaje(`Rostro verificado: ${mejor.nombre_completo} (${Math.round(Number(mejor.confianza || 0) * 100)}%).`);
      showOk('Rostro verificado correctamente.');
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => () => {
    detenerCamaraQr();
    detenerFacialManual();
  }, []);

  useEffect(() => {
    setFacialVerificado(false);
    setFacialCoincidencia(null);
    setQrPendiente((actual) => actual && Number(actual.payload?.id_trabajador) === Number(manual) ? actual : null);
    setFacialMensaje(manual ? 'Listo para registrar asistencia manual.' : 'Selecciona un trabajador.');
    detenerFacialManual();
  }, [manual]);

  useEffect(() => {
    if (!camara.ok) return;
    obtenerHtml5Qr()
      .then((Html5Qrcode) => Html5Qrcode.getCameras())
      .then((lista) => {
        setCamaras(lista || []);
        if (lista?.length && !camaraSeleccionada) {
          setCamaraSeleccionada(lista[0].id);
        }
      })
      .catch(() => setCamaras([]));
  }, [camara.ok]);

  async function corregirAsistencia(id, fila, tipo) {
    setCorreccion({
      id,
      tipo,
      trabajador: fila.nombre_completo,
      marcado_en: fechaHoraSql(tipo === 'entrada' ? fila.hora_entrada : fila.hora_salida),
      estado: tipo === 'entrada' ? fila.estado : 'puntual',
      minutos_tardanza: tipo === 'entrada' ? Number(fila.minutos_tardanza || 0) : 0,
      observacion: ''
    });
  }

  async function guardarCorreccion(event) {
    event.preventDefault();
    if (!correccion) return;
    try {
      await api.patch(`/asistencias/${correccion.id}/corregir`, {
        marcado_en: correccion.marcado_en,
        estado: correccion.estado,
        minutos_tardanza: correccion.tipo === 'entrada' ? Number(correccion.minutos_tardanza || 0) : 0,
        observacion: correccion.observacion || null
      });
      setCorreccion(null);
      showOk('Asistencia corregida.');
      recargar();
    } catch (error) { showError(error); }
  }

  return (
    <Stack>
      <Modal opened={Boolean(correccion)} onClose={() => setCorreccion(null)} title="Corregir asistencia" centered size="lg">
        {correccion && (
          <form onSubmit={guardarCorreccion}>
            <Stack>
              <Alert color="blue" title={correccion.trabajador}>
                Corrigiendo {correccion.tipo}. Usa formato YYYY-MM-DD HH:mm:ss.
              </Alert>
              <TextInput label="Fecha y hora" value={correccion.marcado_en} onChange={(e) => setCorreccion((actual) => ({ ...actual, marcado_en: e.target.value }))} required />
              {correccion.tipo === 'entrada' && (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select label="Estado" data={['puntual', 'tardanza', 'ausente', 'justificado']} value={correccion.estado} onChange={(valor) => setCorreccion((actual) => ({ ...actual, estado: valor || 'puntual' }))} required />
                  <NumberInput label="Minutos tardanza" value={correccion.minutos_tardanza} onChange={(valor) => setCorreccion((actual) => ({ ...actual, minutos_tardanza: valor || 0 }))} min={0} />
                </SimpleGrid>
              )}
              <Textarea label="Observacion" value={correccion.observacion} onChange={(e) => setCorreccion((actual) => ({ ...actual, observacion: e.target.value }))} minRows={3} />
              <Group justify="flex-end">
                <Button variant="light" color="gray" onClick={() => setCorreccion(null)}>Cancelar</Button>
                <Button type="submit">Guardar correccion</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Metric label="Registraron entrada" value={registrados} icon={IconCheck} color="green" />
        <Metric label="Faltan entrada" value={pendientesEntrada} icon={IconAlertTriangle} color="red" />
        <Metric label="Faltan salida" value={pendientesSalida} icon={IconClock} color="yellow" />
      </SimpleGrid>

      {!camara.ok && (
        <Alert color="yellow" icon={<IconAlertTriangle />} title="Camara bloqueada por el navegador">
          <Text size="sm">Estas abriendo: <b>{camara.urlActual}</b></Text>
          <Text size="sm">En computadora abre <b>http://localhost:5180</b>. Si usas IP local, debe ser HTTPS.</Text>
          <Button mt="sm" component="a" href={camara.urlSegura} variant="light" color="yellow">Abrir version segura</Button>
        </Alert>
      )}
      <Alert color="blue" icon={<IconShieldCheck />} title="Registro por QR">
        Al leer un fotocheck QR valido, la asistencia se registra automaticamente y el sistema emite un sonido de confirmacion.
      </Alert>
      <div className="two-col">
        {puedeRegistroManual && <Card withBorder className="register-card">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>Registro manual</Title>
              <Text c="dimmed" size="sm">El sistema marca entrada o salida automaticamente segun el estado del dia.</Text>
            </div>
            <ThemeIcon size={44} radius="xl" variant="light"><IconId size={24} /></ThemeIcon>
          </Group>
          <Stack>
            <FieldSelect label="Trabajador" data={trabajadores} value={manual} onChange={setManual} />
            {seleccionado && (
              <Paper withBorder p="md" className="worker-status">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={800}>{seleccionado.nombre_completo}</Text>
                    <Text size="sm" c="dimmed">{seleccionado.area} - {seleccionado.cargo || 'Sin cargo'}</Text>
                    <Text size="sm" mt={6}>Entrada: <b>{fechaHora(seleccionado.hora_entrada)}</b></Text>
                    <Text size="sm">Salida: <b>{fechaHora(seleccionado.hora_salida)}</b></Text>
                  </div>
                  <Badge color={!seleccionado.hora_entrada ? 'red' : !seleccionado.hora_salida ? 'yellow' : 'green'}>
                    {!seleccionado.hora_entrada ? 'Entrada pendiente' : !seleccionado.hora_salida ? 'Salida pendiente' : 'Completo'}
                  </Badge>
                </Group>
              </Paper>
            )}
            <Alert color={seleccionado?.hora_entrada && seleccionado?.hora_salida ? 'green' : 'blue'} title="Siguiente accion">
              {accionSugerida}
            </Alert>
            <Button size="lg" disabled={!manual || (seleccionado?.hora_entrada && seleccionado?.hora_salida)} onClick={registrarManual}>
              {!seleccionado?.hora_entrada ? 'Registrar entrada' : !seleccionado?.hora_salida ? 'Registrar salida' : 'Asistencia completa'}
            </Button>
          </Stack>
        </Card>}
        <Card withBorder className="register-card">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>Registro por QR</Title>
              <Text c="dimmed" size="sm">Pega el QR firmado o usa la camara cuando estes en localhost/HTTPS.</Text>
            </div>
            <ThemeIcon size={44} radius="xl" color="teal" variant="light"><IconQrcode size={24} /></ThemeIcon>
          </Group>
          <Stack>
            <div className="qr-camera-box">
              <div id="qr-reader" className="qr-reader-live">
              </div>
              <div className={`qr-camera-placeholder ${scannerActivo ? 'is-hidden' : ''}`}>
                <IconQrcode size={58} stroke={1.4} />
                <Text fw={800}>{scannerIniciando ? 'Iniciando camara...' : 'Camara apagada'}</Text>
                <Text size="sm" c="dimmed" ta="center">Presiona Iniciar camara para leer el QR del trabajador.</Text>
              </div>
            </div>
            <Select
              label="Camara a utilizar"
              placeholder={camara.ok ? 'Selecciona una camara' : 'Camara no disponible'}
              data={camaras.map((item, index) => ({
                value: item.id,
                label: item.label || `Camara ${index + 1}`
              }))}
              value={camaraSeleccionada || null}
              onChange={setCamaraSeleccionada}
              disabled={!camara.ok || scannerActivo || scannerIniciando || !camaras.length}
              searchable
            />
            <Group grow>
              <Button onClick={iniciarCamaraQr} loading={scannerIniciando} disabled={!camara.ok || scannerActivo || !camaraSeleccionada}>Iniciar camara</Button>
              <Button variant="light" color="gray" onClick={detenerCamaraQr} disabled={!scannerActivo}>Detener</Button>
            </Group>
            <Textarea minRows={7} value={qrTexto} onChange={(e) => setQrTexto(e.target.value)} placeholder='{"payload":...,"firma":"..."}' />
            <Group grow>
              <Button onClick={registrarQr} disabled={!qrTexto}>
                Registrar QR
              </Button>
              <Button variant="light" color="gray" onClick={() => { setQrTexto(''); setQrPendiente(null); }} disabled={!qrTexto}>Limpiar</Button>
            </Group>
          </Stack>
        </Card>
      </div>
      <Card withBorder>
        <Title order={3} mb="md">Pendientes rapidos</Title>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Stack gap="xs">
            <Text fw={800}>Sin entrada</Text>
            {datos.asistenciasHoy.filter((x) => !x.hora_entrada).slice(0, 6).map((x) => (
              <Paper key={x.id_trabajador} withBorder p="sm"><Group justify="space-between"><Text>{x.nombre_completo}</Text><Badge color="red">Entrada</Badge></Group></Paper>
            ))}
          </Stack>
          <Stack gap="xs">
            <Text fw={800}>Sin salida</Text>
            {datos.asistenciasHoy.filter((x) => x.hora_entrada && !x.hora_salida).slice(0, 6).map((x) => (
              <Paper key={x.id_trabajador} withBorder p="sm"><Group justify="space-between"><Text>{x.nombre_completo}</Text><Badge color="yellow">Salida</Badge></Group></Paper>
            ))}
          </Stack>
        </SimpleGrid>
      </Card>
      <Card withBorder>
        <Title order={3} mb="md">Ultimos estados</Title>
        <TablaAsistencia filas={datos.asistenciasHoy} onCorregir={esAdmin ? corregirAsistencia : null} />
      </Card>
    </Stack>
  );
}

function TablaAsistencia({ filas, onCorregir }) {
  const paginacion = usePaginacion(filas, 10);
  return (
    <>
      <Table.ScrollContainer minWidth={760}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr><Table.Th>Trabajador</Table.Th><Table.Th>Area</Table.Th><Table.Th>Entrada</Table.Th><Table.Th>Salida</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Tardanza</Table.Th>{onCorregir && <Table.Th>Corregir</Table.Th>}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginacion.filas.map((x) => (
              <Table.Tr key={x.id_trabajador}>
                <Table.Td><Text fw={700}>{x.nombre_completo}</Text><Text size="xs" c="dimmed">{x.dni}</Text></Table.Td>
                <Table.Td>{x.area}</Table.Td>
                <Table.Td>{fechaHora(x.hora_entrada)}</Table.Td>
                <Table.Td>{fechaHora(x.hora_salida)}</Table.Td>
                <Table.Td><Badge color={x.estado === 'tardanza' ? 'yellow' : x.estado === 'ausente' ? 'red' : 'green'}>{x.estado}</Badge></Table.Td>
                <Table.Td>{Number(x.minutos_tardanza || 0)} min</Table.Td>
                {onCorregir && <Table.Td><Group gap={6}>{x.id_asistencia_entrada && <Button size="xs" variant="light" onClick={() => onCorregir(x.id_asistencia_entrada, x, 'entrada')}>Entrada</Button>}{x.id_asistencia_salida && <Button size="xs" variant="light" onClick={() => onCorregir(x.id_asistencia_salida, x, 'salida')}>Salida</Button>}</Group></Table.Td>}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Paginador paginacion={paginacion} totalItems={filas.length} />
    </>
  );
}

function Personal({ datos, recargar, usuario, setUsuario }) {
  const [form, set, reset] = useFormState({ nombre_completo: '', dni: '', correo: '', telefono: '', url_foto: '', id_area: '', id_cargo: '', id_turno_actual: '' });
  const [area, setArea, resetArea] = useFormState({ nombre: '' });
  const [cargo, setCargo, resetCargo] = useFormState({ id_area: '', nombre: '' });
  const [editando, setEditando] = useState(null);
  const [fotocheck, setFotocheck] = useState(null);
  const [rostroCamara, setRostroCamara] = useState(null);
  const [fotosModal, setFotosModal] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const [filtroArea, setFiltroArea] = useState('');
  const videoRostroAdminRef = useRef(null);
  const streamRostroAdminRef = useRef(null);
  const areas = datos.areas.filter((a) => estaActivo(a.activo)).map((a) => ({ value: String(a.id_area), label: a.nombre }));
  const cargos = datos.cargos
    .filter((c) => estaActivo(c.activo) && (!form.id_area || Number(c.id_area) === Number(form.id_area)))
    .map((c) => ({ value: String(c.id_cargo), label: `${c.nombre} - ${c.area}` }));
  const cargosEdicion = datos.cargos
    .filter((c) => estaActivo(c.activo) && (!editando?.id_area || Number(c.id_area) === Number(editando.id_area)))
    .map((c) => ({ value: String(c.id_cargo), label: `${c.nombre} - ${c.area}` }));
  const turnos = datos.turnos.map((t) => ({ value: String(t.id_turno), label: t.nombre }));
  const usuariosSistema = datos.usuarios
    .filter((u) => u.estado === 'activo')
    .map((u) => ({ value: String(u.id_usuario), label: `${u.nombre_completo} - ${u.usuario} (${u.rol})` }));
  const totalActivos = datos.trabajadores.filter((t) => estaActivo(t.activo)).length;
  const totalInactivos = datos.trabajadores.length - totalActivos;
  const personalFiltrado = datos.trabajadores.filter((t) => {
    const texto = `${t.nombre_completo} ${t.dni} ${t.area || ''} ${t.cargo || ''}`.toLowerCase();
    const coincideTexto = texto.includes(busqueda.trim().toLowerCase());
    const coincideEstado = filtroEstado === 'todos' || (filtroEstado === 'activos' ? estaActivo(t.activo) : !estaActivo(t.activo));
    const coincideArea = !filtroArea || Number(t.id_area) === Number(filtroArea);
    return coincideTexto && coincideEstado && coincideArea;
  });
  const personalPagina = usePaginacion(personalFiltrado, 10);
  const areasPagina = usePaginacion(datos.areas, 8);
  const cargosPagina = usePaginacion(datos.cargos, 8);
  const esAdmin = usuario?.rol === 'admin';
  const camaraPersonal = estadoCamara();

  async function crear(event) {
    event.preventDefault();
    try {
      await api.post('/trabajadores', {
        ...form,
        id_area: Number(form.id_area),
        id_cargo: form.id_cargo ? Number(form.id_cargo) : null,
        id_turno_actual: form.id_turno_actual ? Number(form.id_turno_actual) : null
      });
      reset();
      showOk('Trabajador creado.');
      recargar();
    } catch (error) {
      showError(error);
    }
  }

  function iniciarEdicionTrabajador(t) {
    setEditando({
      id_trabajador: t.id_trabajador,
      nombre_completo: t.nombre_completo || '',
      dni: t.dni || '',
      correo: t.correo || '',
      telefono: t.telefono || '',
      url_foto: t.url_foto || '',
      id_usuario: t.id_usuario ? String(t.id_usuario) : '',
      id_usuario_original: t.id_usuario ? String(t.id_usuario) : '',
      id_area: t.id_area ? String(t.id_area) : '',
      id_cargo: t.id_cargo ? String(t.id_cargo) : '',
      id_turno_actual: t.id_turno_actual ? String(t.id_turno_actual) : ''
    });
  }

  function setEditar(campo, valor) {
    setEditando((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardarEdicionTrabajador(event) {
    event.preventDefault();
    if (!editando) return;
    try {
      await api.put(`/trabajadores/${editando.id_trabajador}`, {
        nombre_completo: editando.nombre_completo,
        dni: editando.dni,
        correo: editando.correo || null,
        telefono: editando.telefono || null,
        url_foto: editando.url_foto || null,
        id_area: Number(editando.id_area),
        id_cargo: editando.id_cargo ? Number(editando.id_cargo) : null,
        id_turno_actual: editando.id_turno_actual ? Number(editando.id_turno_actual) : null
      });
      if (editando.id_usuario !== editando.id_usuario_original) {
        await api.patch(`/trabajadores/${editando.id_trabajador}/vincular-usuario`, {
          id_usuario: editando.id_usuario ? Number(editando.id_usuario) : null
        });
        if ([editando.id_usuario, editando.id_usuario_original].some((id) => Number(id) === Number(usuario.id_usuario))) {
          const respuesta = await api.get('/auth/me');
          setUsuario?.(respuesta.usuario);
        }
      }
      setEditando(null);
      showOk('Trabajador actualizado.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function toggleTrabajador(t) {
    try {
      await api.patch(`/trabajadores/${t.id_trabajador}/${estaActivo(t.activo) ? 'desactivar' : 'reactivar'}`, {});
      showOk(estaActivo(t.activo) ? 'Trabajador desactivado.' : 'Trabajador reactivado.');
      recargar();
    } catch (error) { showError(error); }
  }

  function abrirFotocheck(t) {
    setFotocheck({
      trabajador: t,
      incluirFoto: Boolean(t.url_foto),
      incluirLogo: true,
      incluirDatosEmpresa: true,
      abrirWhatsapp: true
    });
  }

  async function generarFotocheck(event) {
    event?.preventDefault();
    if (!fotocheck?.trabajador) return;
    const t = fotocheck.trabajador;
    const limpiar = (valor) => String(valor || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    try {
      const respuesta = await api.get(`/qr/trabajador/${t.id_trabajador}`);
      const qrDataUrl = await crearQrDataUrl(JSON.stringify(respuesta.qr), { width: 260, margin: 2 });
      const nombreEmpresa = valorConfig(datos.configuraciones, 'nombre_empresa', 'Control de asistencia');
      const logoEmpresa = valorConfig(datos.configuraciones, 'logo_empresa_url', '');
      const eslogan = valorConfig(datos.configuraciones, 'eslogan_empresa', '');
      const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Fotocheck</title><style>body{font-family:Arial;background:#eef2f7;padding:24px}.card{width:380px;margin:auto;background:white;border-radius:18px;padding:24px;text-align:center;box-shadow:0 20px 60px #0002}.logo{max-width:120px;max-height:52px;object-fit:contain;margin:0 auto 8px}.avatar{width:104px;height:104px;border-radius:999px;object-fit:cover;background:#dbeafe;margin:14px auto}.avatar-empty{width:104px;height:104px;border-radius:999px;background:#dbeafe;margin:14px auto;display:grid;place-items:center;color:#64748b}h1{font-size:18px;margin:12px 0 4px}.muted{color:#64748b}.data{margin-top:8px;line-height:1.6}.qr{width:220px;margin-top:18px}.brand{font-weight:700;font-size:14px}</style></head><body><div class="card">${fotocheck.incluirDatosEmpresa ? `${fotocheck.incluirLogo && logoEmpresa ? `<img class="logo" src="${limpiar(logoEmpresa)}"/>` : ''}<div class="brand">${limpiar(nombreEmpresa)}</div>${eslogan ? `<div class="muted">${limpiar(eslogan)}</div>` : ''}` : ''}${fotocheck.incluirFoto ? (t.url_foto ? `<img class="avatar" src="${limpiar(t.url_foto)}"/>` : `<div class="avatar-empty">Sin foto</div>`) : ''}<h1>${limpiar(t.nombre_completo)}</h1><div class="data"><div>DNI: <b>${limpiar(t.dni)}</b></div><div>${limpiar(t.area || '')} - ${limpiar(t.cargo || 'Sin cargo')}</div><div>Telefono: ${limpiar(t.telefono || '-')}</div></div><img class="qr" src="${qrDataUrl}"/><p class="muted">QR firmado de asistencia</p></div></body></html>`;
      const ventana = window.open('', '_blank');
      if (!ventana) throw new Error('El navegador bloqueo la ventana emergente del fotocheck.');
      ventana.opener = null;
      ventana.document.open();
      ventana.document.write(html);
      ventana.document.close();
      const telefono = String(t.telefono || '').replace(/\D/g, '');
      const mensaje = encodeURIComponent(`Fotocheck de asistencia\nEmpresa: ${nombreEmpresa}\nTrabajador: ${t.nombre_completo}\nDNI: ${t.dni}\nArea/Cargo: ${t.area || ''} - ${t.cargo || 'Sin cargo'}\nContenido firmado del QR:\n${JSON.stringify(respuesta.qr)}`);
      if (fotocheck.abrirWhatsapp) {
        setTimeout(() => window.open(telefono ? `https://wa.me/${telefono}?text=${mensaje}` : `https://wa.me/?text=${mensaje}`, '_blank', 'noopener'), 250);
      }
      setFotocheck(null);
    } catch (error) { showError(error); }
  }

  async function subirRostroBase(t) {
    setRostroCamara({
      trabajador: t,
      activo: false,
      mensaje: 'Inicia la camara y captura el rostro del trabajador.'
    });
  }

  async function abrirFotos(t) {
    setFotosModal({ trabajador: t, fotos: [], cargando: true });
    try {
      const respuesta = await api.get(`/trabajadores/${t.id_trabajador}/fotos`);
      setFotosModal({ trabajador: t, fotos: respuesta.fotos || [], cargando: false });
    } catch (error) {
      setFotosModal(null);
      showError(error);
    }
  }

  async function marcarFotoPrincipal(foto) {
    if (!fotosModal?.trabajador) return;
    try {
      await api.patch(`/trabajadores/${fotosModal.trabajador.id_trabajador}/fotos/${foto.id_foto}/principal`, {});
      showOk('Foto principal actualizada.');
      await abrirFotos(fotosModal.trabajador);
      recargar();
    } catch (error) { showError(error); }
  }

  async function iniciarCamaraRostroAdmin() {
    try {
      if (!camaraPersonal.ok) throw new Error('La camara requiere HTTPS o abrir la web en localhost.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRostroAdminRef.current = stream;
      if (videoRostroAdminRef.current) {
        videoRostroAdminRef.current.srcObject = stream;
        await videoRostroAdminRef.current.play();
      }
      setRostroCamara((actual) => ({ ...actual, activo: true, mensaje: 'Camara activa. Centra el rostro y presiona Capturar y guardar.' }));
    } catch (error) { showError(error); }
  }

  function detenerCamaraRostroAdmin() {
    streamRostroAdminRef.current?.getTracks().forEach((track) => track.stop());
    streamRostroAdminRef.current = null;
    if (videoRostroAdminRef.current) videoRostroAdminRef.current.srcObject = null;
    setRostroCamara((actual) => actual ? ({ ...actual, activo: false }) : actual);
  }

  async function capturarGuardarRostro() {
    try {
      if (!rostroCamara?.trabajador) return;
      if (!videoRostroAdminRef.current || !rostroCamara.activo) throw new Error('Inicia la camara antes de capturar.');
      const descriptor = descriptorDesdeVideo(videoRostroAdminRef.current);
      const fotoCapturada = fotoDesdeVideo(videoRostroAdminRef.current);
      const t = rostroCamara.trabajador;
      await api.post('/facial/plantillas', {
        id_trabajador: Number(t.id_trabajador),
        descriptor,
        foto: fotoCapturada
      });
      detenerCamaraRostroAdmin();
      setRostroCamara(null);
      showOk('Rostro capturado y guardado.');
      recargar();
    } catch (error) { showError(error); }
  }

  useEffect(() => () => detenerCamaraRostroAdmin(), []);

  async function crearArea(event) {
    event.preventDefault();
    try {
      await api.post('/trabajadores/catalogos/areas', area);
      resetArea();
      showOk('Area guardada.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function crearCargo(event) {
    event.preventDefault();
    try {
      await api.post('/trabajadores/catalogos/cargos', { ...cargo, id_area: Number(cargo.id_area) });
      resetCargo();
      showOk('Cargo guardado.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function toggleArea(a) {
    try {
      await api.put(`/trabajadores/catalogos/areas/${a.id_area}`, { nombre: a.nombre, activo: !estaActivo(a.activo) });
      showOk(!estaActivo(a.activo) ? 'Area reactivada.' : 'Area desactivada.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function toggleCargo(c) {
    try {
      await api.put(`/trabajadores/catalogos/cargos/${c.id_cargo}`, { id_area: Number(c.id_area), nombre: c.nombre, activo: !estaActivo(c.activo) });
      showOk(!estaActivo(c.activo) ? 'Cargo reactivado.' : 'Cargo desactivado.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function editarArea(a) {
    const nombre = window.prompt('Nombre del area', a.nombre);
    if (!nombre) return;
    try {
      await api.put(`/trabajadores/catalogos/areas/${a.id_area}`, { nombre, activo: estaActivo(a.activo) });
      showOk('Area actualizada.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function editarCargo(c) {
    const nombre = window.prompt('Nombre del cargo', c.nombre);
    if (!nombre) return;
    try {
      await api.put(`/trabajadores/catalogos/cargos/${c.id_cargo}`, { id_area: Number(c.id_area), nombre, activo: estaActivo(c.activo) });
      showOk('Cargo actualizado.');
      recargar();
    } catch (error) { showError(error); }
  }

  return (
    <Stack>
      {esAdmin && <Modal opened={Boolean(editando)} onClose={() => setEditando(null)} title="Editar trabajador" centered size="lg">
        {editando && (
          <form onSubmit={guardarEdicionTrabajador}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Nombre completo" value={editando.nombre_completo} onChange={(e) => setEditar('nombre_completo', e.target.value)} required />
              <TextInput label="DNI" value={editando.dni} onChange={(e) => setEditar('dni', e.target.value)} required />
              <TextInput label="Correo" value={editando.correo || ''} onChange={(e) => setEditar('correo', e.target.value)} />
              <TextInput label="Telefono" value={editando.telefono || ''} onChange={(e) => setEditar('telefono', e.target.value)} />
              <FieldSelect
                label="Area"
                data={areas}
                value={editando.id_area}
                onChange={(valor) => setEditando((actual) => ({ ...actual, id_area: valor || '', id_cargo: '' }))}
                required
              />
              <FieldSelect label="Cargo" data={cargosEdicion} value={editando.id_cargo} onChange={(valor) => setEditar('id_cargo', valor || '')} />
              <FieldSelect label="Turno" data={turnos} value={editando.id_turno_actual} onChange={(valor) => setEditar('id_turno_actual', valor || '')} />
              <FieldSelect
                label="Usuario vinculado"
                data={usuariosSistema}
                value={editando.id_usuario}
                onChange={(valor) => setEditar('id_usuario', valor || '')}
                placeholder="Sin acceso vinculado"
              />
            </SimpleGrid>
            <Text size="sm" c="dimmed" mt="sm">
              El usuario vinculado podra entrar a Mi portal para ver su fotocheck, QR y asistencias, aunque tenga rol admin, supervisor o vigilante.
            </Text>
            <Group justify="flex-end" mt="lg">
              <Button variant="light" color="gray" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button type="submit">Guardar cambios</Button>
            </Group>
          </form>
        )}
      </Modal>}

      {esAdmin && <Modal opened={Boolean(rostroCamara)} onClose={() => { detenerCamaraRostroAdmin(); setRostroCamara(null); }} title="Capturar rostro del trabajador" centered size="lg">
        {rostroCamara && (
          <Stack>
            <Alert color="blue" title={rostroCamara.trabajador.nombre_completo}>
              {rostroCamara.mensaje}
            </Alert>
            <div className="face-video-wrap">
              <video ref={videoRostroAdminRef} muted playsInline />
              {!rostroCamara.activo && (
                <div className="face-video-placeholder">
                  <IconUser size={48} stroke={1.5} />
                  <Text fw={800}>Camara apagada</Text>
                  <Text size="sm" c="dimmed" ta="center">La foto se captura desde la camara, no desde una URL.</Text>
                </div>
              )}
            </div>
            <Group grow>
              <Button variant="light" onClick={iniciarCamaraRostroAdmin} disabled={!camaraPersonal.ok || rostroCamara.activo}>Iniciar camara</Button>
              <Button color="green" onClick={capturarGuardarRostro} disabled={!rostroCamara.activo}>Capturar y guardar</Button>
              <Button variant="light" color="gray" onClick={detenerCamaraRostroAdmin} disabled={!rostroCamara.activo}>Detener</Button>
            </Group>
          </Stack>
        )}
      </Modal>}

      {esAdmin && <Modal opened={Boolean(fotosModal)} onClose={() => setFotosModal(null)} title="Fotos del trabajador" centered size="xl">
        {fotosModal && (
          <Stack>
            <Alert color="blue" title={fotosModal.trabajador.nombre_completo}>
              Estas fotos vienen de las capturas realizadas desde la camara. La foto principal se usa en el portal y fotocheck.
            </Alert>
            {fotosModal.cargando ? (
              <Text c="dimmed">Cargando fotos...</Text>
            ) : fotosModal.fotos.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                {fotosModal.fotos.map((foto) => (
                  <Paper key={foto.id_foto} withBorder p="sm" className="worker-photo-card">
                    <img src={foto.url_imagen} alt="Foto del trabajador" className="worker-photo-preview" />
                    <Group justify="space-between" mt="sm">
                      <div>
                        <Badge color={estaActivo(foto.es_principal) ? 'green' : 'gray'}>
                          {estaActivo(foto.es_principal) ? 'Principal' : 'Historial'}
                        </Badge>
                        <Text size="xs" c="dimmed" mt={4}>{fechaHora(foto.creado_en)}</Text>
                      </div>
                      <Button size="xs" variant="light" disabled={estaActivo(foto.es_principal)} onClick={() => marcarFotoPrincipal(foto)}>
                        Usar
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            ) : (
              <Paper withBorder p="lg" className="empty-state">
                <Text fw={800}>Aun no hay fotos capturadas.</Text>
                <Text size="sm" c="dimmed">Usa el boton Rostro para guardar la primera foto desde la camara.</Text>
              </Paper>
            )}
          </Stack>
        )}
      </Modal>}

      {esAdmin && <Modal opened={Boolean(fotocheck)} onClose={() => setFotocheck(null)} title="Generar fotocheck y QR" centered size="lg">
        {fotocheck && (
          <form onSubmit={generarFotocheck}>
            <Stack>
              <Alert color="blue" title={fotocheck.trabajador.nombre_completo}>
                El fotocheck solo lo genera el administrador. Puedes incluir la foto del trabajador y los datos de la empresa.
              </Alert>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Checkbox
                  label="Incluir foto del trabajador"
                  description={fotocheck.trabajador.url_foto ? 'Usa la foto capturada con camara.' : 'No hay foto capturada; mostrara Sin foto.'}
                  checked={fotocheck.incluirFoto}
                  onChange={(e) => setFotocheck((actual) => ({ ...actual, incluirFoto: e.currentTarget.checked }))}
                />
                <Checkbox
                  label="Incluir datos de empresa"
                  description="Nombre, eslogan y datos configurados."
                  checked={fotocheck.incluirDatosEmpresa}
                  onChange={(e) => setFotocheck((actual) => ({ ...actual, incluirDatosEmpresa: e.currentTarget.checked }))}
                />
                <Checkbox
                  label="Incluir logo"
                  description="Usa logo_empresa_url de Configuracion."
                  checked={fotocheck.incluirLogo}
                  onChange={(e) => setFotocheck((actual) => ({ ...actual, incluirLogo: e.currentTarget.checked }))}
                  disabled={!fotocheck.incluirDatosEmpresa}
                />
                <Checkbox
                  label="Abrir WhatsApp"
                  description="Prepara el mensaje con el QR firmado."
                  checked={fotocheck.abrirWhatsapp}
                  onChange={(e) => setFotocheck((actual) => ({ ...actual, abrirWhatsapp: e.currentTarget.checked }))}
                />
              </SimpleGrid>
              <Group justify="flex-end">
                <Button variant="light" color="gray" onClick={() => setFotocheck(null)}>Cancelar</Button>
                <Button type="submit" leftSection={<IconQrcode size={16} />}>Generar fotocheck</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>}

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric label="Personal activo" value={totalActivos} icon={IconUsers} color="green" />
        <Metric label="Personal inactivo" value={totalInactivos} icon={IconAlertTriangle} color="red" />
        <Metric label="Areas activas" value={areas.length} icon={IconBuilding} color="blue" />
      </SimpleGrid>

      <div className="personal-layout">
      {esAdmin && <Card withBorder className="personal-form-card">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3}>Gestion de personal</Title>
            <Text size="sm" c="dimmed">Trabajadores, areas y cargos en una vista compacta.</Text>
          </div>
          <ThemeIcon size={44} radius="xl" variant="light"><IconUser size={24} /></ThemeIcon>
        </Group>
        <Tabs defaultValue="nuevo" mt="md">
          <Tabs.List><Tabs.Tab value="nuevo">Nuevo trabajador</Tabs.Tab><Tabs.Tab value="areas">Areas</Tabs.Tab><Tabs.Tab value="cargos">Cargos</Tabs.Tab></Tabs.List>
          <Tabs.Panel value="nuevo" pt="md">
            <form onSubmit={crear}>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="Nombre completo" value={form.nombre_completo} onChange={set('nombre_completo')} required />
                <TextInput label="DNI" value={form.dni} onChange={set('dni')} required />
                <TextInput label="Correo" value={form.correo || ''} onChange={set('correo')} />
                <TextInput label="Telefono" value={form.telefono || ''} onChange={set('telefono')} />
                <FieldSelect label="Area" data={areas} value={form.id_area} onChange={(valor) => { set('id_area')(valor); set('id_cargo')(''); }} required />
                <FieldSelect label="Cargo" data={cargos} value={form.id_cargo} onChange={set('id_cargo')} />
                <FieldSelect label="Turno" data={turnos} value={form.id_turno_actual} onChange={set('id_turno_actual')} />
              </SimpleGrid>
              <Group justify="flex-end" mt="md"><Button type="submit">Guardar trabajador</Button></Group>
            </form>
          </Tabs.Panel>
          <Tabs.Panel value="areas" pt="md">
            <form onSubmit={crearArea}><Group align="end"><TextInput label="Nueva area" value={area.nombre} onChange={setArea('nombre')} required /><Button type="submit">Agregar</Button></Group></form>
            <Stack mt="sm" gap={8}>{areasPagina.filas.map((a) => (
              <Paper key={a.id_area} withBorder p="sm" className="catalog-row">
                <Group justify="space-between">
                  <div>
                    <Text fw={700}>{a.nombre}</Text>
                    <Badge size="xs" color={estaActivo(a.activo) ? 'green' : 'red'}>{estaActivo(a.activo) ? 'activa' : 'inactiva'}</Badge>
                  </div>
                  <Group gap={6}>
                    <Button size="xs" variant="light" onClick={() => editarArea(a)}>Editar</Button>
                    <Button size="xs" variant="light" color={estaActivo(a.activo) ? 'red' : 'green'} onClick={() => toggleArea(a)}>{estaActivo(a.activo) ? 'Desactivar' : 'Reactivar'}</Button>
                  </Group>
                </Group>
              </Paper>
            ))}</Stack>
            <Paginador paginacion={areasPagina} totalItems={datos.areas.length} />
          </Tabs.Panel>
          <Tabs.Panel value="cargos" pt="md">
            <form onSubmit={crearCargo}><Stack><FieldSelect label="Area" data={areas} value={cargo.id_area} onChange={setCargo('id_area')} required /><TextInput label="Nuevo cargo" value={cargo.nombre} onChange={setCargo('nombre')} required /><Button type="submit">Agregar cargo</Button></Stack></form>
            <Stack mt="sm" gap={8}>{cargosPagina.filas.map((c) => (
              <Paper key={c.id_cargo} withBorder p="sm" className="catalog-row">
                <Group justify="space-between">
                  <div>
                    <Text fw={700}>{c.nombre}</Text>
                    <Text size="xs" c="dimmed">{c.area}</Text>
                  </div>
                  <Group gap={6}>
                    <Button size="xs" variant="light" onClick={() => editarCargo(c)}>Editar</Button>
                    <Button size="xs" variant="light" color={estaActivo(c.activo) ? 'red' : 'green'} onClick={() => toggleCargo(c)}>{estaActivo(c.activo) ? 'Desactivar' : 'Reactivar'}</Button>
                  </Group>
                </Group>
              </Paper>
            ))}</Stack>
            <Paginador paginacion={cargosPagina} totalItems={datos.cargos.length} />
          </Tabs.Panel>
        </Tabs>
      </Card>}
      <Card withBorder className="personal-list-card">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Personal registrado</Title>
            <Text size="sm" c="dimmed">{personalFiltrado.length} trabajador(es) encontrados.</Text>
          </div>
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={recargar}>Actualizar</Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
          <TextInput label="Buscar" placeholder="Nombre, DNI, area o cargo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <Select
            label="Estado"
            value={filtroEstado}
            onChange={(valor) => setFiltroEstado(valor || 'activos')}
            data={[{ value: 'activos', label: 'Solo activos' }, { value: 'inactivos', label: 'Solo inactivos' }, { value: 'todos', label: 'Todos' }]}
          />
          <FieldSelect label="Area" data={areas} value={filtroArea} onChange={setFiltroArea} placeholder="Todas las areas" clearable />
        </SimpleGrid>
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Trabajador</Table.Th><Table.Th>Contacto</Table.Th><Table.Th>Area / cargo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{personalPagina.filas.map((t) => (
              <Table.Tr key={t.id_trabajador}>
                <Table.Td><Text fw={800}>{t.nombre_completo}</Text><Text size="xs" c="dimmed">DNI {t.dni}</Text></Table.Td>
                <Table.Td><Text size="sm">{t.telefono || 'Sin telefono'}</Text><Text size="xs" c="dimmed">{t.correo || 'Sin correo'}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={700}>{t.area}</Text><Text size="xs" c="dimmed">{t.cargo || 'Sin cargo'}</Text></Table.Td>
                <Table.Td><Badge color={estaActivo(t.activo) ? 'green' : 'red'}>{estaActivo(t.activo) ? 'activo' : 'inactivo'}</Badge></Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    {esAdmin && <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => iniciarEdicionTrabajador(t)}>Editar</Button>}
                    {usuario?.rol === 'admin' && (
                      <>
                        <Button size="xs" variant="light" color="blue" leftSection={<IconQrcode size={14} />} onClick={() => abrirFotocheck(t)}>QR</Button>
                        <Button size="xs" variant="light" color="grape" leftSection={<IconPhoto size={14} />} onClick={() => subirRostroBase(t)}>Rostro</Button>
                        <Button size="xs" variant="light" color="teal" leftSection={<IconPhoto size={14} />} onClick={() => abrirFotos(t)}>Fotos</Button>
                      </>
                    )}
                    {esAdmin && <Button size="xs" variant="light" color={estaActivo(t.activo) ? 'red' : 'green'} leftSection={<IconTrash size={14} />} onClick={() => toggleTrabajador(t)}>{estaActivo(t.activo) ? 'Desactivar' : 'Reactivar'}</Button>}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Paginador paginacion={personalPagina} totalItems={personalFiltrado.length} />
        {!personalFiltrado.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay trabajadores con esos filtros.</Text>
            <Text size="sm" c="dimmed">Limpia la busqueda o cambia el estado para ver mas resultados.</Text>
          </Paper>
        )}
      </Card>
      </div>
    </Stack>
  );
}

function Usuarios({ datos, recargar }) {
  const [form, set, reset] = useFormState({ nombre_completo: '', usuario: '', contrasena: '', correo: '', codigo_rol: 'trabajador', id_area: '' });
  const [editandoUsuario, setEditandoUsuario] = useState(null);
  const [claveUsuario, setClaveUsuario] = useState(null);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstadoUsuario, setFiltroEstadoUsuario] = useState('activos');
  const [nuevaClave, setNuevaClave] = useState('');
  const areas = datos.areas.map((a) => ({ value: String(a.id_area), label: a.nombre }));
  const roles = ['admin', 'supervisor', 'vigilante', 'trabajador'];
  const usuariosFiltrados = datos.usuarios.filter((u) => {
    const texto = `${u.nombre_completo} ${u.usuario} ${u.correo || ''} ${u.rol} ${u.area || ''}`.toLowerCase();
    const coincideTexto = texto.includes(busquedaUsuario.trim().toLowerCase());
    const coincideRol = !filtroRol || u.rol === filtroRol;
    const coincideEstado = filtroEstadoUsuario === 'todos' || (filtroEstadoUsuario === 'activos' ? u.estado === 'activo' : u.estado !== 'activo');
    return coincideTexto && coincideRol && coincideEstado;
  });
  const usuariosPagina = usePaginacion(usuariosFiltrados, 10);

  async function crear(event) {
    event.preventDefault();
    try {
      await api.post('/usuarios', { ...form, id_area: form.id_area ? Number(form.id_area) : null });
      reset();
      showOk('Usuario creado.');
      recargar();
    } catch (error) { showError(error); }
  }

  function abrirEdicionUsuario(u) {
    setEditandoUsuario({
      id_usuario: u.id_usuario,
      nombre_completo: u.nombre_completo || '',
      usuario: u.usuario || '',
      correo: u.correo || '',
      codigo_rol: u.rol || 'trabajador',
      id_area: u.id_area ? String(u.id_area) : '',
      estado: u.estado || 'activo'
    });
  }

  function setEditarUsuario(campo, valor) {
    setEditandoUsuario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardarEdicionUsuario(event) {
    event.preventDefault();
    if (!editandoUsuario) return;
    try {
      await api.put(`/usuarios/${editandoUsuario.id_usuario}`, {
        nombre_completo: editandoUsuario.nombre_completo,
        correo: editandoUsuario.correo || null,
        codigo_rol: editandoUsuario.codigo_rol,
        id_area: editandoUsuario.id_area ? Number(editandoUsuario.id_area) : null,
        estado: editandoUsuario.estado
      });
      setEditandoUsuario(null);
      showOk('Usuario actualizado.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function toggleUsuario(u) {
    try {
      await api.patch(`/usuarios/${u.id_usuario}/${u.estado === 'activo' ? 'desactivar' : 'reactivar'}`, {});
      showOk(u.estado === 'activo' ? 'Usuario desactivado.' : 'Usuario reactivado.');
      recargar();
    } catch (error) { showError(error); }
  }

  function abrirCambioClave(u) {
    setClaveUsuario(u);
    setNuevaClave('');
  }

  async function cambiarContrasena(event) {
    event.preventDefault();
    if (!claveUsuario || !nuevaClave) return;
    try {
      await api.patch(`/usuarios/${claveUsuario.id_usuario}/contrasena`, { contrasena: nuevaClave });
      setClaveUsuario(null);
      setNuevaClave('');
      showOk('Contrasena actualizada.');
    } catch (error) { showError(error); }
  }

  return (
    <Stack>
      <Modal opened={Boolean(editandoUsuario)} onClose={() => setEditandoUsuario(null)} title="Editar usuario" centered size="lg">
        {editandoUsuario && (
          <form onSubmit={guardarEdicionUsuario}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Nombre completo" value={editandoUsuario.nombre_completo} onChange={(e) => setEditarUsuario('nombre_completo', e.target.value)} required />
              <TextInput label="Usuario" value={editandoUsuario.usuario} disabled />
              <TextInput label="Correo" value={editandoUsuario.correo || ''} onChange={(e) => setEditarUsuario('correo', e.target.value)} />
              <Select label="Rol" data={roles} value={editandoUsuario.codigo_rol} onChange={(valor) => setEditarUsuario('codigo_rol', valor || 'trabajador')} required />
              <FieldSelect label="Area" data={areas} value={editandoUsuario.id_area} onChange={(valor) => setEditarUsuario('id_area', valor || '')} />
              <Select label="Estado" data={[{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }]} value={editandoUsuario.estado} onChange={(valor) => setEditarUsuario('estado', valor || 'activo')} required />
            </SimpleGrid>
            <Group justify="flex-end" mt="lg">
              <Button variant="light" color="gray" onClick={() => setEditandoUsuario(null)}>Cancelar</Button>
              <Button type="submit">Guardar cambios</Button>
            </Group>
          </form>
        )}
      </Modal>

      <Modal opened={Boolean(claveUsuario)} onClose={() => setClaveUsuario(null)} title="Cambiar contrasena" centered>
        {claveUsuario && (
          <form onSubmit={cambiarContrasena}>
            <Stack>
              <Alert color="blue" title={claveUsuario.usuario}>La nueva contrasena se aplicara inmediatamente.</Alert>
              <PasswordInput label="Nueva contrasena" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} required />
              <Group justify="flex-end">
                <Button variant="light" color="gray" onClick={() => setClaveUsuario(null)}>Cancelar</Button>
                <Button type="submit">Actualizar contrasena</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric label="Usuarios activos" value={datos.usuarios.filter((u) => u.estado === 'activo').length} icon={IconUsers} color="green" />
        <Metric label="Usuarios inactivos" value={datos.usuarios.filter((u) => u.estado !== 'activo').length} icon={IconAlertTriangle} color="red" />
        <Metric label="Roles usados" value={new Set(datos.usuarios.map((u) => u.rol)).size} icon={IconShieldCheck} color="blue" />
      </SimpleGrid>

      <div className="two-col">
      <Card withBorder>
        <Title order={3}>Nuevo usuario</Title>
        <Text size="sm" c="dimmed">Crea accesos para administradores, supervisores, vigilantes o trabajadores.</Text>
        <form onSubmit={crear}><Stack mt="md">
          <TextInput label="Nombre" value={form.nombre_completo} onChange={set('nombre_completo')} required />
          <TextInput label="Usuario" value={form.usuario} onChange={set('usuario')} required />
          <PasswordInput label="Contrasena" value={form.contrasena} onChange={set('contrasena')} required />
          <TextInput label="Correo" value={form.correo} onChange={set('correo')} />
          <Select label="Rol" data={roles} value={form.codigo_rol} onChange={set('codigo_rol')} />
          <FieldSelect label="Area" data={areas} value={form.id_area} onChange={set('id_area')} />
          <Button type="submit">Crear usuario</Button>
        </Stack></form>
      </Card>
      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Usuarios</Title>
            <Text size="sm" c="dimmed">{usuariosFiltrados.length} usuario(s) encontrados.</Text>
          </div>
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={recargar}>Actualizar</Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
          <TextInput label="Buscar" placeholder="Nombre, usuario, correo, rol o area" value={busquedaUsuario} onChange={(e) => setBusquedaUsuario(e.target.value)} />
          <Select label="Rol" placeholder="Todos los roles" data={roles} value={filtroRol || null} onChange={(valor) => setFiltroRol(valor || '')} clearable />
          <Select
            label="Estado"
            value={filtroEstadoUsuario}
            onChange={(valor) => setFiltroEstadoUsuario(valor || 'activos')}
            data={[{ value: 'activos', label: 'Solo activos' }, { value: 'inactivos', label: 'Solo inactivos' }, { value: 'todos', label: 'Todos' }]}
          />
        </SimpleGrid>
        <Table.ScrollContainer minWidth={700}><Table striped>
          <Table.Thead><Table.Tr><Table.Th>Usuario</Table.Th><Table.Th>Rol</Table.Th><Table.Th>Area</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{usuariosPagina.filas.map((u) => <Table.Tr key={u.id_usuario}><Table.Td><Text fw={700}>{u.nombre_completo}</Text><Text size="xs">{u.usuario}</Text><Text size="xs" c="dimmed">{u.correo || 'Sin correo'}</Text></Table.Td><Table.Td><Badge variant="light">{u.rol}</Badge></Table.Td><Table.Td>{u.area || '-'}</Table.Td><Table.Td><Badge color={u.estado === 'activo' ? 'green' : 'red'}>{u.estado}</Badge></Table.Td><Table.Td><Group gap={6}><Button size="xs" variant="light" leftSection={<IconEdit size={14}/>} onClick={() => abrirEdicionUsuario(u)}>Editar</Button><Button size="xs" variant="light" color="grape" leftSection={<IconKey size={14}/>} onClick={() => abrirCambioClave(u)}>Clave</Button><Button size="xs" variant="light" color={u.estado === 'activo' ? 'red' : 'green'} leftSection={<IconTrash size={14}/>} onClick={() => toggleUsuario(u)}>{u.estado === 'activo' ? 'Desactivar' : 'Reactivar'}</Button></Group></Table.Td></Table.Tr>)}</Table.Tbody>
        </Table></Table.ScrollContainer>
        <Paginador paginacion={usuariosPagina} totalItems={usuariosFiltrados.length} />
        {!usuariosFiltrados.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay usuarios con esos filtros.</Text>
            <Text size="sm" c="dimmed">Prueba con otro rol, estado o texto de busqueda.</Text>
          </Paper>
        )}
      </Card>
      </div>
    </Stack>
  );
}

function Turnos({ datos, recargar }) {
  const [form, set, reset] = useFormState({ nombre: '', hora_entrada: '08:00', hora_salida: '17:00', minutos_tolerancia: 10 });
  const [asignacion, setAsignacion] = useFormState({ id_trabajador: '', id_turno: '', fecha_inicio: hoy(), fecha_fin: '' });
  const [editandoTurno, setEditandoTurno] = useState(null);
  const [busquedaAsignacion, setBusquedaAsignacion] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const trabajadores = datos.trabajadores.map((t) => ({ value: String(t.id_trabajador), label: `${t.nombre_completo} - ${t.dni}` }));
  const turnos = datos.turnos.filter((t) => estaActivo(t.activo)).map((t) => ({ value: String(t.id_turno), label: t.nombre }));
  const asignacionesFiltradas = datos.asignaciones.filter((a) => {
    const texto = `${a.trabajador} ${a.dni || ''} ${a.area || ''} ${a.turno}`.toLowerCase();
    const coincideTexto = texto.includes(busquedaAsignacion.trim().toLowerCase());
    const coincideTurno = !filtroTurno || Number(a.id_turno) === Number(filtroTurno);
    return coincideTexto && coincideTurno;
  });
  const turnosPagina = usePaginacion(datos.turnos, 10);
  const asignacionesPagina = usePaginacion(asignacionesFiltradas, 10);
  const turnosActivos = datos.turnos.filter((t) => estaActivo(t.activo)).length;

  async function crear(event) {
    event.preventDefault();
    try {
      await api.post('/turnos', { ...form, minutos_tolerancia: Number(form.minutos_tolerancia || 0) });
      reset();
      showOk('Turno creado.');
      recargar();
    } catch (error) { showError(error); }
  }
  async function asignar(event) {
    event.preventDefault();
    try {
      await api.post('/turnos/asignar', {
        id_trabajador: Number(asignacion.id_trabajador),
        id_turno: Number(asignacion.id_turno),
        fecha_inicio: asignacion.fecha_inicio,
        fecha_fin: asignacion.fecha_fin || null
      });
      showOk('Turno asignado.');
      recargar();
    } catch (error) { showError(error); }
  }

  function abrirEdicionTurno(t) {
    setEditandoTurno({
      id_turno: t.id_turno,
      nombre: t.nombre || '',
      hora_entrada: String(t.hora_entrada || '').slice(0, 5),
      hora_salida: String(t.hora_salida || '').slice(0, 5),
      minutos_tolerancia: Number(t.minutos_tolerancia || 0),
      activo: estaActivo(t.activo) ? 'true' : 'false'
    });
  }

  function setEditarTurno(campo, valor) {
    setEditandoTurno((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardarEdicionTurno(event) {
    event.preventDefault();
    if (!editandoTurno) return;
    try {
      await api.put(`/turnos/${editandoTurno.id_turno}`, {
        nombre: editandoTurno.nombre,
        hora_entrada: editandoTurno.hora_entrada,
        hora_salida: editandoTurno.hora_salida,
        minutos_tolerancia: Number(editandoTurno.minutos_tolerancia || 0),
        activo: editandoTurno.activo === 'true'
      });
      setEditandoTurno(null);
      showOk('Turno actualizado.');
      recargar();
    } catch (error) { showError(error); }
  }
  return (
    <Stack>
      <Modal opened={Boolean(editandoTurno)} onClose={() => setEditandoTurno(null)} title="Editar turno" centered size="lg">
        {editandoTurno && (
          <form onSubmit={guardarEdicionTurno}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Nombre" value={editandoTurno.nombre} onChange={(e) => setEditarTurno('nombre', e.target.value)} required />
              <Select
                label="Estado"
                data={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }]}
                value={editandoTurno.activo}
                onChange={(valor) => setEditarTurno('activo', valor || 'true')}
                required
              />
              <TextInput label="Entrada" type="time" value={editandoTurno.hora_entrada} onChange={(e) => setEditarTurno('hora_entrada', e.target.value)} required />
              <TextInput label="Salida" type="time" value={editandoTurno.hora_salida} onChange={(e) => setEditarTurno('hora_salida', e.target.value)} required />
              <NumberInput label="Tolerancia en minutos" value={editandoTurno.minutos_tolerancia} onChange={(valor) => setEditarTurno('minutos_tolerancia', valor || 0)} min={0} max={240} />
            </SimpleGrid>
            <Group justify="flex-end" mt="lg">
              <Button variant="light" color="gray" onClick={() => setEditandoTurno(null)}>Cancelar</Button>
              <Button type="submit">Guardar cambios</Button>
            </Group>
          </form>
        )}
      </Modal>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric label="Turnos activos" value={turnosActivos} icon={IconClock} color="green" />
        <Metric label="Turnos inactivos" value={datos.turnos.length - turnosActivos} icon={IconAlertTriangle} color="red" />
        <Metric label="Asignaciones" value={datos.asignaciones.length} icon={IconCalendarTime} color="blue" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder><Title order={3}>Crear turno</Title><form onSubmit={crear}><Stack mt="md">
          <TextInput label="Nombre" value={form.nombre} onChange={set('nombre')} required />
          <TextInput label="Entrada" type="time" value={form.hora_entrada} onChange={set('hora_entrada')} required />
          <TextInput label="Salida" type="time" value={form.hora_salida} onChange={set('hora_salida')} required />
          <NumberInput label="Tolerancia" value={form.minutos_tolerancia} onChange={set('minutos_tolerancia')} min={0} />
          <Button type="submit">Guardar turno</Button>
        </Stack></form></Card>
        <Card withBorder><Title order={3}>Asignar turno</Title><form onSubmit={asignar}><Stack mt="md">
          <FieldSelect label="Trabajador" data={trabajadores} value={asignacion.id_trabajador} onChange={setAsignacion('id_trabajador')} required />
          <FieldSelect label="Turno" data={turnos} value={asignacion.id_turno} onChange={setAsignacion('id_turno')} required />
          <TextInput label="Fecha inicio" type="date" value={asignacion.fecha_inicio} onChange={setAsignacion('fecha_inicio')} required />
          <TextInput label="Fecha fin" type="date" value={asignacion.fecha_fin || ''} onChange={setAsignacion('fecha_fin')} />
          <Button type="submit">Asignar</Button>
        </Stack></form></Card>
      </SimpleGrid>
      <Card withBorder>
        <Group justify="space-between" mb="md">
          <Title order={3}>Turnos registrados</Title>
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={recargar}>Actualizar</Button>
        </Group>
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Nombre</Table.Th><Table.Th>Horario</Table.Th><Table.Th>Tolerancia</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{turnosPagina.filas.map((t) => <Table.Tr key={t.id_turno}><Table.Td><Text fw={800}>{t.nombre}</Text></Table.Td><Table.Td>{String(t.hora_entrada).slice(0, 5)} - {String(t.hora_salida).slice(0, 5)}</Table.Td><Table.Td>{t.minutos_tolerancia} min</Table.Td><Table.Td><Badge color={estaActivo(t.activo) ? 'green' : 'red'}>{estaActivo(t.activo) ? 'activo' : 'inactivo'}</Badge></Table.Td><Table.Td><Button size="xs" variant="light" leftSection={<IconEdit size={14}/>} onClick={() => abrirEdicionTurno(t)}>Editar</Button></Table.Td></Table.Tr>)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Paginador paginacion={turnosPagina} totalItems={datos.turnos.length} />
      </Card>
      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Asignaciones recientes</Title>
            <Text size="sm" c="dimmed">{asignacionesFiltradas.length} asignacion(es) encontradas.</Text>
          </div>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
          <TextInput label="Buscar" placeholder="Trabajador, DNI, area o turno" value={busquedaAsignacion} onChange={(e) => setBusquedaAsignacion(e.target.value)} />
          <FieldSelect label="Turno" data={turnos} value={filtroTurno} onChange={setFiltroTurno} placeholder="Todos los turnos" clearable />
        </SimpleGrid>
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Trabajador</Table.Th><Table.Th>Area</Table.Th><Table.Th>Turno</Table.Th><Table.Th>Inicio</Table.Th><Table.Th>Fin</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{asignacionesPagina.filas.map((a) => <Table.Tr key={a.id_asignacion_turno}><Table.Td><Text fw={700}>{a.trabajador}</Text><Text size="xs" c="dimmed">{a.dni}</Text></Table.Td><Table.Td>{a.area || '-'}</Table.Td><Table.Td><Text fw={700}>{a.turno}</Text><Text size="xs" c="dimmed">{String(a.hora_entrada).slice(0, 5)} - {String(a.hora_salida).slice(0, 5)}</Text></Table.Td><Table.Td>{a.fecha_inicio}</Table.Td><Table.Td>{a.fecha_fin || 'Sin fin'}</Table.Td></Table.Tr>)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Paginador paginacion={asignacionesPagina} totalItems={asignacionesFiltradas.length} />
        {!asignacionesFiltradas.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay asignaciones con esos filtros.</Text>
            <Text size="sm" c="dimmed">Limpia la busqueda o selecciona otro turno.</Text>
          </Paper>
        )}
      </Card>
    </Stack>
  );
}

function Solicitudes({ datos, usuario, recargar }) {
  const [form, set, reset] = useFormState({
    id_trabajador: usuario.id_trabajador ? String(usuario.id_trabajador) : '',
    codigo_tipo: '',
    fecha_solicitud: hoy(),
    motivo: '',
    url_adjunto: ''
  });
  const [decision, setDecision] = useState(null);
  const [editandoSolicitud, setEditandoSolicitud] = useState(null);
  const [busquedaSolicitud, setBusquedaSolicitud] = useState('');
  const [estadoSolicitud, setEstadoSolicitud] = useState('pendiente');
  const [tipoSolicitud, setTipoSolicitud] = useState('');
  const [busquedaMis, setBusquedaMis] = useState('');
  const [estadoMis, setEstadoMis] = useState('todos');
  const trabajadores = datos.trabajadores.map((t) => ({ value: String(t.id_trabajador), label: `${t.nombre_completo} - ${t.dni}` }));
  const tipos = datos.tipos.map((t) => ({ value: t.codigo, label: t.nombre }));
  const solicitudesFiltradas = datos.solicitudes.filter((s) => {
    const texto = `${s.trabajador || ''} ${s.dni || ''} ${s.area || ''} ${s.tipo || ''} ${s.motivo || ''}`.toLowerCase();
    const coincideTexto = texto.includes(busquedaSolicitud.trim().toLowerCase());
    const coincideEstado = estadoSolicitud === 'todos' || s.estado === estadoSolicitud;
    const coincideTipo = !tipoSolicitud || s.codigo_tipo === tipoSolicitud;
    return coincideTexto && coincideEstado && coincideTipo;
  });
  const misSolicitudesFiltradas = datos.misSolicitudes.filter((s) => {
    const texto = `${s.tipo || ''} ${s.motivo || ''} ${s.estado || ''}`.toLowerCase();
    const coincideTexto = texto.includes(busquedaMis.trim().toLowerCase());
    const coincideEstado = estadoMis === 'todos' || s.estado === estadoMis;
    return coincideTexto && coincideEstado;
  });
  const solicitudesPagina = usePaginacion(solicitudesFiltradas, 10);
  const misSolicitudesPagina = usePaginacion(misSolicitudesFiltradas, 10);
  const totalPendientes = datos.solicitudes.filter((s) => s.estado === 'pendiente').length;
  const totalAprobadas = datos.solicitudes.filter((s) => s.estado === 'aprobada').length;
  const totalRechazadas = datos.solicitudes.filter((s) => s.estado === 'rechazada').length;

  async function crearSolicitud(event) {
    event.preventDefault();
    try {
      await api.post('/solicitudes', {
        ...form,
        id_trabajador: Number(form.id_trabajador),
        url_adjunto: form.url_adjunto || null
      });
      reset();
      showOk('Solicitud enviada.');
      recargar();
    } catch (error) { showError(error); }
  }

  function abrirDecision(solicitud, valor) {
    setDecision({
      solicitud,
      decision: valor,
      comentario: valor === 'aprobada' ? 'Solicitud aprobada.' : 'Solicitud rechazada.',
      minutos_aprobados: solicitud.codigo_tipo === 'horas_extra' && valor === 'aprobada' ? 60 : 0
    });
  }

  async function decidirSolicitud(event) {
    event.preventDefault();
    if (!decision) return;
    try {
      await api.post(`/solicitudes/${decision.solicitud.id_solicitud}/decidir`, {
        decision: decision.decision,
        comentario: decision.comentario,
        minutos_aprobados: Number(decision.minutos_aprobados || 0)
      });
      showOk(`Solicitud ${decision.decision}.`);
      setDecision(null);
      recargar();
    } catch (error) { showError(error); }
  }

  function abrirEdicionSolicitud(s) {
    setEditandoSolicitud({
      id_solicitud: s.id_solicitud,
      codigo_tipo: s.codigo_tipo || '',
      fecha_solicitud: s.fecha_solicitud || hoy(),
      motivo: s.motivo || '',
      url_adjunto: s.url_adjunto || ''
    });
  }

  function setEditarSolicitud(campo, valor) {
    setEditandoSolicitud((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardarEdicionSolicitud(event) {
    event.preventDefault();
    if (!editandoSolicitud) return;
    try {
      await api.put(`/solicitudes/${editandoSolicitud.id_solicitud}`, {
        codigo_tipo: editandoSolicitud.codigo_tipo,
        fecha_solicitud: editandoSolicitud.fecha_solicitud,
        motivo: editandoSolicitud.motivo,
        url_adjunto: editandoSolicitud.url_adjunto || null
      });
      setEditandoSolicitud(null);
      showOk('Solicitud actualizada.');
      recargar();
    } catch (error) { showError(error); }
  }

  async function cancelar(id) {
    if (!confirm('Quieres cancelar esta solicitud?')) return;
    try {
      await api.patch(`/solicitudes/${id}/cancelar`, {});
      showOk('Solicitud cancelada.');
      recargar();
    } catch (error) { showError(error); }
  }

  return (
    <Stack>
      <Modal opened={Boolean(decision)} onClose={() => setDecision(null)} title={decision?.decision === 'aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud'} centered size="lg">
        {decision && (
          <form onSubmit={decidirSolicitud}>
            <Stack>
              <Alert color={decision.decision === 'aprobada' ? 'green' : 'red'} title={decision.solicitud.trabajador}>
                {decision.solicitud.tipo} - {decision.solicitud.fecha_solicitud}
              </Alert>
              {decision.solicitud.codigo_tipo === 'horas_extra' && decision.decision === 'aprobada' && (
                <NumberInput label="Minutos aprobados" value={decision.minutos_aprobados} onChange={(valor) => setDecision((actual) => ({ ...actual, minutos_aprobados: valor || 0 }))} min={1} max={1440} required />
              )}
              <Textarea label="Comentario" value={decision.comentario} onChange={(e) => setDecision((actual) => ({ ...actual, comentario: e.target.value }))} minRows={3} required />
              <Group justify="flex-end">
                <Button variant="light" color="gray" onClick={() => setDecision(null)}>Cancelar</Button>
                <Button color={decision.decision === 'aprobada' ? 'green' : 'red'} type="submit">{decision.decision === 'aprobada' ? 'Aprobar' : 'Rechazar'}</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>

      <Modal opened={Boolean(editandoSolicitud)} onClose={() => setEditandoSolicitud(null)} title="Editar solicitud" centered size="lg">
        {editandoSolicitud && (
          <form onSubmit={guardarEdicionSolicitud}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <FieldSelect label="Tipo" data={tipos} value={editandoSolicitud.codigo_tipo} onChange={(valor) => setEditarSolicitud('codigo_tipo', valor || '')} required />
              <TextInput label="Fecha" type="date" value={editandoSolicitud.fecha_solicitud} onChange={(e) => setEditarSolicitud('fecha_solicitud', e.target.value)} required />
              <TextInput label="Adjunto URL" value={editandoSolicitud.url_adjunto || ''} onChange={(e) => setEditarSolicitud('url_adjunto', e.target.value)} />
            </SimpleGrid>
            <Textarea mt="md" label="Motivo" value={editandoSolicitud.motivo} onChange={(e) => setEditarSolicitud('motivo', e.target.value)} minRows={4} required />
            <Group justify="flex-end" mt="lg">
              <Button variant="light" color="gray" onClick={() => setEditandoSolicitud(null)}>Cancelar</Button>
              <Button type="submit">Guardar cambios</Button>
            </Group>
          </form>
        )}
      </Modal>

      {['admin', 'supervisor'].includes(usuario.rol) && (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Metric label="Pendientes" value={totalPendientes} icon={IconClock} color="yellow" />
          <Metric label="Aprobadas" value={totalAprobadas} icon={IconCheck} color="green" />
          <Metric label="Rechazadas" value={totalRechazadas} icon={IconAlertTriangle} color="red" />
        </SimpleGrid>
      )}

      {['admin', 'trabajador'].includes(usuario.rol) && (
        <Card withBorder>
          <Title order={3}>Nueva solicitud</Title>
          <Text size="sm" c="dimmed">El motivo debe tener al menos 10 caracteres.</Text>
          <form onSubmit={crearSolicitud}>
            <SimpleGrid cols={{ base: 1, md: 2 }} mt="md">
              <FieldSelect label="Trabajador" data={trabajadores} value={form.id_trabajador} onChange={set('id_trabajador')} disabled={usuario.rol === 'trabajador'} required />
              <FieldSelect label="Tipo" data={tipos} value={form.codigo_tipo} onChange={set('codigo_tipo')} required />
              <TextInput label="Fecha" type="date" value={form.fecha_solicitud} onChange={set('fecha_solicitud')} required />
              <TextInput label="Adjunto URL" value={form.url_adjunto || ''} onChange={set('url_adjunto')} />
            </SimpleGrid>
            <Textarea mt="md" label="Motivo" value={form.motivo} onChange={set('motivo')} minRows={3} required />
            <Button mt="md" type="submit">Enviar solicitud</Button>
          </form>
        </Card>
      )}
      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Solicitudes por revisar</Title>
            <Text size="sm" c="dimmed">{solicitudesFiltradas.length} solicitud(es) encontradas.</Text>
          </div>
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={recargar}>Actualizar</Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
          <TextInput label="Buscar" placeholder="Trabajador, DNI, area, tipo o motivo" value={busquedaSolicitud} onChange={(e) => setBusquedaSolicitud(e.target.value)} />
          <Select label="Estado" value={estadoSolicitud} onChange={(valor) => setEstadoSolicitud(valor || 'pendiente')} data={[{ value: 'pendiente', label: 'Pendientes' }, { value: 'aprobada', label: 'Aprobadas' }, { value: 'rechazada', label: 'Rechazadas' }, { value: 'todos', label: 'Todas' }]} />
          <FieldSelect label="Tipo" data={tipos} value={tipoSolicitud} onChange={setTipoSolicitud} placeholder="Todos los tipos" clearable />
        </SimpleGrid>
        <Table.ScrollContainer minWidth={920}><Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Trabajador</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Accion</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{solicitudesPagina.filas.map((s) => <Table.Tr key={s.id_solicitud}>
            <Table.Td><Text fw={700}>{s.trabajador}</Text><Text size="xs" c="dimmed">{s.dni} - {s.area}</Text></Table.Td>
            <Table.Td>{s.tipo}</Table.Td>
            <Table.Td>{s.fecha_solicitud}</Table.Td>
            <Table.Td><Text lineClamp={2}>{s.motivo}</Text>{s.url_adjunto && <Button size="compact-xs" variant="subtle" component="a" href={s.url_adjunto} target="_blank" rel="noreferrer">Ver adjunto</Button>}</Table.Td>
            <Table.Td><Badge color={colorSolicitud(s.estado)}>{s.estado}</Badge>{s.minutos_aprobados ? <Text size="xs" c="dimmed">{s.minutos_aprobados} min</Text> : null}</Table.Td>
            <Table.Td>{s.estado === 'pendiente' && ['admin', 'supervisor'].includes(usuario.rol) ? <Group gap={6}><Button size="xs" color="green" onClick={() => abrirDecision(s, 'aprobada')}>Aprobar</Button><Button size="xs" color="red" variant="light" onClick={() => abrirDecision(s, 'rechazada')}>Rechazar</Button></Group> : '-'}</Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table></Table.ScrollContainer>
        <Paginador paginacion={solicitudesPagina} totalItems={solicitudesFiltradas.length} />
        {!solicitudesFiltradas.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay solicitudes con esos filtros.</Text>
            <Text size="sm" c="dimmed">Cambia el estado, tipo o texto de busqueda.</Text>
          </Paper>
        )}
      </Card>
      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Mis solicitudes</Title>
            <Text size="sm" c="dimmed">{misSolicitudesFiltradas.length} solicitud(es) encontradas.</Text>
          </div>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
          <TextInput label="Buscar" placeholder="Tipo, motivo o estado" value={busquedaMis} onChange={(e) => setBusquedaMis(e.target.value)} />
          <Select label="Estado" value={estadoMis} onChange={(valor) => setEstadoMis(valor || 'todos')} data={[{ value: 'todos', label: 'Todas' }, { value: 'pendiente', label: 'Pendientes' }, { value: 'aprobada', label: 'Aprobadas' }, { value: 'rechazada', label: 'Rechazadas' }]} />
        </SimpleGrid>
        <Table.ScrollContainer minWidth={780}><Table striped><Table.Thead><Table.Tr><Table.Th>Tipo</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Respuesta</Table.Th><Table.Th>Accion</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{misSolicitudesPagina.filas.map((s) => <Table.Tr key={s.id_solicitud}><Table.Td>{s.tipo}</Table.Td><Table.Td>{s.fecha_solicitud}</Table.Td><Table.Td><Text lineClamp={2}>{s.motivo}</Text>{s.url_adjunto && <Button size="compact-xs" variant="subtle" component="a" href={s.url_adjunto} target="_blank" rel="noreferrer">Ver adjunto</Button>}</Table.Td><Table.Td><Badge color={colorSolicitud(s.estado)}>{s.estado}</Badge></Table.Td><Table.Td><Text size="sm">{s.comentario || '-'}</Text></Table.Td><Table.Td>{s.estado === 'pendiente' ? <Group gap={6}><Button size="xs" variant="light" onClick={() => abrirEdicionSolicitud(s)}>Editar</Button><Button size="xs" color="red" variant="light" onClick={() => cancelar(s.id_solicitud)}>Cancelar</Button></Group> : '-'}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
        <Paginador paginacion={misSolicitudesPagina} totalItems={misSolicitudesFiltradas.length} />
        {!misSolicitudesFiltradas.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay solicitudes personales con esos filtros.</Text>
            <Text size="sm" c="dimmed">Crea una solicitud o cambia los filtros.</Text>
          </Paper>
        )}
      </Card>
    </Stack>
  );
}

function Reportes({ datos, setDatos, usuario }) {
  const [filtro, setFiltro, resetFiltro] = useFormState({ fecha_inicio: hoy(), fecha_fin: hoy(), id_trabajador: '', id_area: '', estado: '' });
  const [busquedaReporte, setBusquedaReporte] = useState('');
  const [tipoReporte, setTipoReporte] = useState('');
  const [origenReporte, setOrigenReporte] = useState('');
  const trabajadores = datos.trabajadores.map((t) => ({ value: String(t.id_trabajador), label: `${t.nombre_completo} - ${t.dni}` }));
  const areas = datos.areas.filter((a) => estaActivo(a.activo)).map((a) => ({ value: String(a.id_area), label: a.nombre }));
  const reporteFiltrado = datos.reporte.filter((r) => {
    const texto = `${r.nombre_completo || ''} ${r.dni || ''} ${r.area || ''} ${r.cargo || ''} ${r.estado || ''} ${r.origen || ''}`.toLowerCase();
    const coincideTexto = texto.includes(busquedaReporte.trim().toLowerCase());
    const coincideTipo = !tipoReporte || r.tipo_marcacion === tipoReporte;
    const coincideOrigen = !origenReporte || r.origen === origenReporte;
    return coincideTexto && coincideTipo && coincideOrigen;
  });
  const reportePagina = usePaginacion(reporteFiltrado, 10);
  const totalEntradas = reporteFiltrado.filter((r) => r.tipo_marcacion === 'entrada').length;
  const totalSalidas = reporteFiltrado.filter((r) => r.tipo_marcacion === 'salida').length;
  const totalTardanzas = reporteFiltrado.filter((r) => r.estado === 'tardanza').length;
  const resumenTrabajadores = Object.values(reporteFiltrado.reduce((acc, r) => {
    const clave = r.dni || r.nombre_completo;
    acc[clave] ||= { trabajador: r.nombre_completo, dni: r.dni, area: r.area, entradas: 0, salidas: 0, tardanzas: 0, minutos: 0 };
    if (r.tipo_marcacion === 'entrada') acc[clave].entradas += 1;
    if (r.tipo_marcacion === 'salida') acc[clave].salidas += 1;
    if (r.estado === 'tardanza') acc[clave].tardanzas += 1;
    acc[clave].minutos += Number(r.minutos_tardanza || 0);
    return acc;
  }, {})).sort((a, b) => b.tardanzas - a.tardanzas || b.minutos - a.minutos || a.trabajador.localeCompare(b.trabajador)).slice(0, 8);
  const resumenAreas = Object.values(reporteFiltrado.reduce((acc, r) => {
    const clave = r.area || 'Sin area';
    acc[clave] ||= { area: clave, registros: 0, entradas: 0, tardanzas: 0, minutos: 0 };
    acc[clave].registros += 1;
    if (r.tipo_marcacion === 'entrada') acc[clave].entradas += 1;
    if (r.estado === 'tardanza') acc[clave].tardanzas += 1;
    acc[clave].minutos += Number(r.minutos_tardanza || 0);
    return acc;
  }, {})).sort((a, b) => b.tardanzas - a.tardanzas || b.minutos - a.minutos || a.area.localeCompare(b.area)).slice(0, 8);

  async function generar(event) {
    event.preventDefault();
    try {
      const params = new URLSearchParams();
      Object.entries(filtro).forEach(([k, v]) => { if (v) params.set(k, v); });
      const respuesta = await api.get(`/reportes/asistencias-rango?${params}`);
      setDatos((d) => ({ ...d, reporte: respuesta.reporte || [] }));
      showOk('Reporte generado.');
    } catch (error) { showError(error); }
  }

  function limpiarFiltrosReporte() {
    resetFiltro();
    setBusquedaReporte('');
    setTipoReporte('');
    setOrigenReporte('');
  }

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 4 }}>
        <Metric label="Registros" value={reporteFiltrado.length} icon={IconReportAnalytics} color="blue" />
        <Metric label="Entradas" value={totalEntradas} icon={IconDownload} color="green" />
        <Metric label="Salidas" value={totalSalidas} icon={IconLogout} color="indigo" />
        <Metric label="Tardanzas" value={totalTardanzas} icon={IconAlertTriangle} color="yellow" />
      </SimpleGrid>

      <Card withBorder>
        <Title order={3}>Filtros del reporte</Title>
        <Text size="sm" c="dimmed">Genera el reporte desde la base de datos y luego filtra el resultado en pantalla.</Text>
        <form onSubmit={generar}>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} mt="md">
            <TextInput label="Desde" type="date" value={filtro.fecha_inicio} onChange={setFiltro('fecha_inicio')} />
            <TextInput label="Hasta" type="date" value={filtro.fecha_fin} onChange={setFiltro('fecha_fin')} />
            {usuario?.rol === 'admin' && <FieldSelect label="Area" data={areas} value={filtro.id_area} onChange={setFiltro('id_area')} placeholder="Todas las areas" clearable />}
            <Select label="Estado" data={[{ value: 'puntual', label: 'Puntual' }, { value: 'tardanza', label: 'Tardanza' }, { value: 'ausente', label: 'Ausente' }]} value={filtro.estado || null} onChange={(valor) => setFiltro('estado')(valor || '')} placeholder="Todos" clearable />
            <FieldSelect label="Trabajador" data={trabajadores} value={filtro.id_trabajador} onChange={setFiltro('id_trabajador')} placeholder="Todos" clearable />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button type="button" variant="light" color="gray" onClick={limpiarFiltrosReporte}>Limpiar filtros</Button>
            <Button type="submit">Generar reporte</Button>
          </Group>
        </form>
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3}>Resumen por trabajador</Title>
            <Button size="xs" variant="light" leftSection={<IconDownload size={14}/>} onClick={() => descargarCsv('resumen-trabajadores.csv', resumenTrabajadores)}>CSV</Button>
          </Group>
          <Table.ScrollContainer minWidth={620}>
            <Table striped highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>Trabajador</Table.Th><Table.Th>Entradas</Table.Th><Table.Th>Salidas</Table.Th><Table.Th>Tardanzas</Table.Th><Table.Th>Minutos</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{resumenTrabajadores.map((r) => (
                <Table.Tr key={r.dni || r.trabajador}>
                  <Table.Td><Text fw={700}>{r.trabajador}</Text><Text size="xs" c="dimmed">{r.dni} - {r.area}</Text></Table.Td>
                  <Table.Td>{r.entradas}</Table.Td>
                  <Table.Td>{r.salidas}</Table.Td>
                  <Table.Td><Badge color={r.tardanzas ? 'yellow' : 'green'}>{r.tardanzas}</Badge></Table.Td>
                  <Table.Td>{r.minutos} min</Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!resumenTrabajadores.length && <Text size="sm" c="dimmed">Genera un reporte para ver el resumen.</Text>}
        </Card>

        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3}>Resumen por area</Title>
            <Button size="xs" variant="light" leftSection={<IconDownload size={14}/>} onClick={() => descargarCsv('resumen-areas.csv', resumenAreas)}>CSV</Button>
          </Group>
          <Table.ScrollContainer minWidth={560}>
            <Table striped highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>Area</Table.Th><Table.Th>Registros</Table.Th><Table.Th>Entradas</Table.Th><Table.Th>Tardanzas</Table.Th><Table.Th>Minutos</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{resumenAreas.map((r) => (
                <Table.Tr key={r.area}>
                  <Table.Td><Text fw={700}>{r.area}</Text></Table.Td>
                  <Table.Td>{r.registros}</Table.Td>
                  <Table.Td>{r.entradas}</Table.Td>
                  <Table.Td><Badge color={r.tardanzas ? 'yellow' : 'green'}>{r.tardanzas}</Badge></Table.Td>
                  <Table.Td>{r.minutos} min</Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!resumenAreas.length && <Text size="sm" c="dimmed">Genera un reporte para ver el resumen.</Text>}
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Resultado</Title>
            <Text size="sm" c="dimmed">{reporteFiltrado.length} registro(s) encontrados.</Text>
          </div>
          <Group gap={6}>
            <Button size="xs" variant="light" leftSection={<IconDownload size={14}/>} onClick={() => descargarCsv('reporte-asistencias.csv', reporteFiltrado)}>CSV</Button>
            <Button size="xs" variant="light" onClick={() => imprimirTabla('Reporte de asistencias', reporteFiltrado)}>PDF</Button>
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
          <TextInput label="Buscar en resultado" placeholder="Trabajador, DNI, area, cargo, estado u origen" value={busquedaReporte} onChange={(e) => setBusquedaReporte(e.target.value)} />
          <Select label="Tipo" data={[{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} value={tipoReporte || null} onChange={(valor) => setTipoReporte(valor || '')} placeholder="Todos" clearable />
          <Select label="Origen" data={[{ value: 'manual', label: 'Manual' }, { value: 'qr', label: 'QR' }, { value: 'facial', label: 'Facial' }]} value={origenReporte || null} onChange={(valor) => setOrigenReporte(valor || '')} placeholder="Todos" clearable />
        </SimpleGrid>
        <Table.ScrollContainer minWidth={980}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Trabajador</Table.Th><Table.Th>Area / cargo</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Hora</Table.Th><Table.Th>Origen</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Tardanza</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{reportePagina.filas.map((r, index) => <Table.Tr key={`${r.fecha_asistencia}-${r.dni}-${r.tipo_marcacion}-${r.marcado_en}-${index}`}><Table.Td>{r.fecha_asistencia}</Table.Td><Table.Td><Text fw={700}>{r.nombre_completo}</Text><Text size="xs" c="dimmed">{r.dni}</Text></Table.Td><Table.Td><Text size="sm">{r.area}</Text><Text size="xs" c="dimmed">{r.cargo || 'Sin cargo'}</Text></Table.Td><Table.Td><Badge variant="light">{r.tipo_marcacion}</Badge></Table.Td><Table.Td>{fechaHora(r.marcado_en)}</Table.Td><Table.Td>{r.origen}</Table.Td><Table.Td><Badge color={colorAsistencia(r.estado)}>{r.estado}</Badge></Table.Td><Table.Td>{Number(r.minutos_tardanza || 0)} min</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
        <Paginador paginacion={reportePagina} totalItems={reporteFiltrado.length} />
        {!reporteFiltrado.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay registros para mostrar.</Text>
            <Text size="sm" c="dimmed">Genera un reporte o cambia los filtros.</Text>
          </Paper>
        )}
      </Card>
    </Stack>
  );
}

function Configuracion({ datos, recargar }) {
  const [editandoConfig, setEditandoConfig] = useState(null);
  const [busquedaConfig, setBusquedaConfig] = useState('');
  const items = datos.configuraciones.filter((c) => {
    const texto = `${c.clave} ${etiquetaConfiguracion(c.clave)} ${c.descripcion || ''} ${JSON.stringify(c.valor)}`.toLowerCase();
    return texto.includes(busquedaConfig.trim().toLowerCase());
  });
  const booleanas = datos.configuraciones.filter((c) => typeof c.valor === 'boolean').length;
  const numericas = datos.configuraciones.filter((c) => tipoConfiguracion(c.clave, c.valor) === 'number').length;

  function abrirConfig(c) {
    const tipo = tipoConfiguracion(c.clave, c.valor);
    setEditandoConfig({
      clave: c.clave,
      descripcion: c.descripcion || '',
      tipo,
      valor: tipo === 'boolean' ? String(Boolean(c.valor)) : c.valor
    });
  }

  function valorConfigEditada() {
    if (!editandoConfig) return null;
    if (editandoConfig.tipo === 'boolean') return editandoConfig.valor === 'true';
    if (editandoConfig.tipo === 'number') return Number(editandoConfig.valor || 0);
    return editandoConfig.valor || '';
  }

  async function guardarConfig(event) {
    event.preventDefault();
    if (!editandoConfig) return;
    try {
      await api.put(`/configuracion/${editandoConfig.clave}`, {
        valor: valorConfigEditada(),
        descripcion: editandoConfig.descripcion || ''
      });
      setEditandoConfig(null);
      showOk('Configuracion actualizada.');
      recargar();
    } catch (error) { showError(error); }
  }

  return (
    <Stack>
      <Modal opened={Boolean(editandoConfig)} onClose={() => setEditandoConfig(null)} title="Editar configuracion" centered size="lg">
        {editandoConfig && (
          <form onSubmit={guardarConfig}>
            <Stack>
              <Alert color="blue" title={etiquetaConfiguracion(editandoConfig.clave)}>
                {editandoConfig.clave}
              </Alert>
              {editandoConfig.tipo === 'boolean' ? (
                <Select
                  label="Valor"
                  data={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }]}
                  value={String(editandoConfig.valor)}
                  onChange={(valor) => setEditandoConfig((actual) => ({ ...actual, valor: valor || 'false' }))}
                  required
                />
              ) : editandoConfig.tipo === 'number' ? (
                <NumberInput
                  label="Valor"
                  value={Number(editandoConfig.valor || 0)}
                  onChange={(valor) => setEditandoConfig((actual) => ({ ...actual, valor: valor ?? 0 }))}
                  min={editandoConfig.clave.includes('confianza') ? 0 : undefined}
                  max={editandoConfig.clave.includes('confianza') ? 1 : undefined}
                  step={editandoConfig.clave.includes('confianza') ? 0.01 : 1}
                  required
                />
              ) : (
                <TextInput label="Valor" value={editandoConfig.valor || ''} onChange={(e) => setEditandoConfig((actual) => ({ ...actual, valor: e.target.value }))} />
              )}
              <Textarea label="Descripcion" value={editandoConfig.descripcion || ''} onChange={(e) => setEditandoConfig((actual) => ({ ...actual, descripcion: e.target.value }))} minRows={3} />
              <Group justify="flex-end">
                <Button variant="light" color="gray" onClick={() => setEditandoConfig(null)}>Cancelar</Button>
                <Button type="submit">Guardar cambios</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric label="Configuraciones" value={datos.configuraciones.length} icon={IconSettings} color="blue" />
        <Metric label="Valores numericos" value={numericas} icon={IconClock} color="yellow" />
        <Metric label="Interruptores" value={booleanas} icon={IconShieldCheck} color="green" />
      </SimpleGrid>

      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Configuracion del sistema</Title>
            <Text size="sm" c="dimmed">{items.length} configuracion(es) encontradas.</Text>
          </div>
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={recargar}>Actualizar</Button>
        </Group>
        <TextInput mb="md" label="Buscar" placeholder="Nombre, clave, descripcion o valor" value={busquedaConfig} onChange={(e) => setBusquedaConfig(e.target.value)} />
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {items.map((c) => (
            <Paper key={c.clave} withBorder p="md" className="catalog-row">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={800}>{etiquetaConfiguracion(c.clave)}</Text>
                  <Text size="xs" c="dimmed">{c.clave}</Text>
                  <Text size="sm" c="dimmed" mt={6}>{c.descripcion || 'Sin descripcion'}</Text>
                </div>
                <Badge color={tipoConfiguracion(c.clave, c.valor) === 'boolean' ? (c.valor ? 'green' : 'red') : 'blue'} variant="light">
                  {tipoConfiguracion(c.clave, c.valor)}
                </Badge>
              </Group>
              <Group justify="space-between" mt="md">
                <Text fw={700}>{typeof c.valor === 'boolean' ? (c.valor ? 'Activo' : 'Inactivo') : String(c.valor || '-')}</Text>
                <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => abrirConfig(c)}>Editar</Button>
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
        {!items.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay configuraciones con esa busqueda.</Text>
            <Text size="sm" c="dimmed">Limpia el texto para ver todas las claves.</Text>
          </Paper>
        )}
      </Card>
    </Stack>
  );
}

function Auditoria({ datos, setDatos }) {
  const [filtro, setFiltro, resetFiltro] = useFormState({ usuario: '', accion: '', entidad: '', ip: '', fecha_inicio: '', fecha_fin: '', limite: 100 });
  const [detalle, setDetalle] = useState(null);
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const entidades = [...new Set(datos.auditoria.map((a) => a.entidad).filter(Boolean))].sort().map((entidad) => ({ value: entidad, label: entidad }));
  const auditoriaFiltrada = datos.auditoria.filter((a) => {
    const texto = `${a.usuario_nombre || ''} ${a.usuario || ''} ${a.accion || ''} ${a.entidad || ''} ${a.ip || ''}`.toLowerCase();
    return texto.includes(busquedaLocal.trim().toLowerCase());
  });
  const auditoriaPagina = usePaginacion(auditoriaFiltrada, 10);
  const usuariosUnicos = new Set(datos.auditoria.map((a) => a.usuario || a.usuario_nombre).filter(Boolean)).size;
  const entidadesUnicas = new Set(datos.auditoria.map((a) => a.entidad).filter(Boolean)).size;
  const accionesCriticas = datos.auditoria.filter((a) => /desactivar|reactivar|contrasena|configuracion|corregir/i.test(a.accion || '')).length;

  async function consultarAuditoria(event) {
    event?.preventDefault();
    try {
      const params = new URLSearchParams();
      Object.entries(filtro).forEach(([k, v]) => { if (v) params.set(k, v); });
      const respuesta = await api.get(`/auditoria?${params}`);
      setDatos((actual) => ({ ...actual, auditoria: respuesta.auditoria || [] }));
      showOk('Auditoria actualizada.');
    } catch (error) { showError(error); }
  }

  async function limpiarAuditoria() {
    resetFiltro();
    setBusquedaLocal('');
    try {
      const respuesta = await api.get('/auditoria?limite=100');
      setDatos((actual) => ({ ...actual, auditoria: respuesta.auditoria || [] }));
    } catch (error) { showError(error); }
  }

  return (
    <Stack>
      <Modal opened={Boolean(detalle)} onClose={() => setDetalle(null)} title="Detalle de auditoria" centered size="xl">
        {detalle && (
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Paper withBorder p="md"><Text size="sm" c="dimmed">Usuario</Text><Text fw={800}>{detalle.usuario_nombre || detalle.usuario || 'Sistema'}</Text></Paper>
              <Paper withBorder p="md"><Text size="sm" c="dimmed">Fecha</Text><Text fw={800}>{fechaHora(detalle.creado_en)}</Text></Paper>
              <Paper withBorder p="md"><Text size="sm" c="dimmed">Accion</Text><Badge>{detalle.accion}</Badge></Paper>
              <Paper withBorder p="md"><Text size="sm" c="dimmed">Entidad</Text><Text fw={800}>{detalle.entidad || '-'}</Text></Paper>
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Textarea label="Datos anteriores" value={JSON.stringify(detalle.datos_anteriores || null, null, 2)} minRows={10} readOnly />
              <Textarea label="Datos nuevos" value={JSON.stringify(detalle.datos_nuevos || null, null, 2)} minRows={10} readOnly />
            </SimpleGrid>
          </Stack>
        )}
      </Modal>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric label="Eventos cargados" value={datos.auditoria.length} icon={IconShieldCheck} color="blue" />
        <Metric label="Usuarios" value={usuariosUnicos} icon={IconUsers} color="green" />
        <Metric label="Acciones sensibles" value={accionesCriticas} icon={IconAlertTriangle} color="red" />
      </SimpleGrid>

      <Card withBorder>
        <Title order={3}>Filtros de auditoria</Title>
        <Text size="sm" c="dimmed">Consulta eventos por usuario, accion, entidad, IP o fecha.</Text>
        <form onSubmit={consultarAuditoria}>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mt="md">
            <TextInput label="Usuario" value={filtro.usuario} onChange={setFiltro('usuario')} placeholder="Nombre o usuario" />
            <TextInput label="Accion" value={filtro.accion} onChange={setFiltro('accion')} placeholder="crear, actualizar..." />
            <FieldSelect label="Entidad" data={entidades} value={filtro.entidad} onChange={setFiltro('entidad')} placeholder="Todas" clearable />
            <TextInput label="IP" value={filtro.ip} onChange={setFiltro('ip')} placeholder="192.168..." />
            <TextInput label="Desde" type="date" value={filtro.fecha_inicio} onChange={setFiltro('fecha_inicio')} />
            <TextInput label="Hasta" type="date" value={filtro.fecha_fin} onChange={setFiltro('fecha_fin')} />
            <NumberInput label="Limite" value={filtro.limite} onChange={setFiltro('limite')} min={1} max={250} />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button type="button" variant="light" color="gray" onClick={limpiarAuditoria}>Limpiar</Button>
            <Button type="submit">Consultar auditoria</Button>
          </Group>
        </form>
      </Card>

      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={3}>Auditoria reciente</Title>
            <Text size="sm" c="dimmed">{auditoriaFiltrada.length} evento(s) visibles. {entidadesUnicas} entidad(es).</Text>
          </div>
          <Button size="xs" variant="light" leftSection={<IconDownload size={14}/>} onClick={() => descargarCsv('auditoria.csv', auditoriaFiltrada)}>Exportar CSV</Button>
        </Group>
        <TextInput mb="md" label="Buscar en resultados" placeholder="Usuario, accion, entidad o IP" value={busquedaLocal} onChange={(e) => setBusquedaLocal(e.target.value)} />
        <Table.ScrollContainer minWidth={940}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Usuario</Table.Th><Table.Th>Accion</Table.Th><Table.Th>Entidad</Table.Th><Table.Th>IP</Table.Th><Table.Th>Detalle</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{auditoriaPagina.filas.map((a) => <Table.Tr key={a.id_auditoria}><Table.Td>{fechaHora(a.creado_en)}</Table.Td><Table.Td><Text fw={700}>{a.usuario_nombre || a.usuario || 'Sistema'}</Text><Text size="xs" c="dimmed">{a.usuario || '-'}</Text></Table.Td><Table.Td><Badge variant="light" color={/desactivar|contrasena|configuracion|corregir/i.test(a.accion || '') ? 'red' : 'blue'}>{a.accion}</Badge></Table.Td><Table.Td>{a.entidad}</Table.Td><Table.Td>{a.ip || '-'}</Table.Td><Table.Td><Button size="xs" variant="light" onClick={() => setDetalle(a)}>Ver</Button></Table.Td></Table.Tr>)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Paginador paginacion={auditoriaPagina} totalItems={auditoriaFiltrada.length} />
        {!auditoriaFiltrada.length && (
          <Paper withBorder p="lg" mt="md" className="empty-state">
            <Text fw={800}>No hay eventos con esos filtros.</Text>
            <Text size="sm" c="dimmed">Cambia la busqueda o consulta otro rango.</Text>
          </Paper>
        )}
      </Card>
    </Stack>
  );
}

function Portal({ datos, usuario, recargar }) {
  const [qrCargando, setQrCargando] = useState(false);
  const [qrPortal, setQrPortal] = useState('');
  const [fotocheckPantallaCompleta, setFotocheckPantallaCompleta] = useState(false);
  const trabajador = datos.trabajadores.find((t) => Number(t.id_trabajador) === Number(usuario.id_trabajador));
  const entradas = datos.misAsistencias.filter((a) => a.tipo_marcacion === 'entrada').length;
  const tardanzas = datos.misAsistencias.filter((a) => a.estado === 'tardanza').length;
  const pendientes = datos.misSolicitudes.filter((s) => s.estado === 'pendiente').length;
  const nombreEmpresa = valorConfig(datos.configuraciones, 'nombre_empresa', 'Control de asistencia');
  const logoEmpresa = valorConfig(datos.configuraciones, 'logo_empresa_url', '');
  const esloganEmpresa = valorConfig(datos.configuraciones, 'eslogan_empresa', '');

  if (!usuario.id_trabajador) {
    return (
      <Stack>
        <Alert color="yellow" icon={<IconAlertTriangle />} title="Tu usuario no tiene trabajador vinculado">
          Para ver fotocheck, QR y asistencias, esta cuenta debe estar vinculada a un registro de trabajador. Entra como admin, crea o edita el trabajador correspondiente y vincula su acceso web.
          <Group mt="sm">
            <Button variant="light" color="yellow" onClick={recargar}>Actualizar vinculo</Button>
          </Group>
        </Alert>
        <Card withBorder>
          <Title order={3}>Mi portal</Title>
          <Text c="dimmed" mt="xs">
            El portal personal aparece para todos los roles, pero solo puede mostrar datos cuando el usuario tambien existe como trabajador.
          </Text>
        </Card>
      </Stack>
    );
  }

  async function generarQr() {
    if (!usuario.id_trabajador) return;
    setQrCargando(true);
    try {
      const respuesta = await api.get(`/qr/trabajador/${usuario.id_trabajador}`);
      const dataUrl = await crearQrDataUrl(JSON.stringify(respuesta.qr), { width: 260 });
      setQrPortal(dataUrl);
      showOk('QR generado.');
    } catch (error) { showError(error); } finally { setQrCargando(false); }
  }

  useEffect(() => {
    if (usuario.id_trabajador && !qrPortal && !qrCargando) {
      generarQr();
    }
  }, [usuario.id_trabajador]);

  return (
    <Stack>
      <Modal
        opened={fotocheckPantallaCompleta}
        onClose={() => setFotocheckPantallaCompleta(false)}
        fullScreen
        title="Fotocheck de asistencia"
      >
        <div className="portal-fullscreen-wrap">
          <Paper withBorder p="xl" className="portal-fotocheck portal-fotocheck-fullscreen">
            {logoEmpresa && <img src={logoEmpresa} alt={nombreEmpresa} className="portal-fotocheck-logo fullscreen" />}
            <Text fw={900} ta="center" className="portal-fullscreen-company">{nombreEmpresa}</Text>
            {esloganEmpresa && <Text c="dimmed" ta="center">{esloganEmpresa}</Text>}
            {trabajador?.url_foto ? (
              <img src={trabajador.url_foto} alt={trabajador.nombre_completo} className="portal-fotocheck-photo fullscreen" />
            ) : (
              <div className="portal-fotocheck-photo fullscreen empty"><IconUser size={68} /></div>
            )}
            <Text fw={900} ta="center" className="portal-fullscreen-name">{trabajador?.nombre_completo || usuario.nombre_completo}</Text>
            <Text size="xl" ta="center">DNI: <b>{trabajador?.dni || '-'}</b></Text>
            <Text size="lg" c="dimmed" ta="center">{trabajador?.area || 'Sin area'} - {trabajador?.cargo || 'Sin cargo'}</Text>
            <div className="portal-fotocheck-qr">
              {qrPortal ? <img src={qrPortal} alt="QR de asistencia" className="portal-qr fullscreen" /> : <Paper withBorder className="portal-qr-placeholder fullscreen"><IconQrcode size={76} /><Text c="dimmed">Generando QR...</Text></Paper>}
            </div>
            <Text size="sm" c="dimmed" ta="center" mt="md">Muestra este QR al encargado para registrar tu asistencia.</Text>
            <Group justify="center" mt="md">
              <Button onClick={generarQr} loading={qrCargando}>Actualizar QR</Button>
              {qrPortal && <Button variant="light" component="a" href={qrPortal} download="mi-fotocheck-qr.png">Descargar QR</Button>}
            </Group>
          </Paper>
        </div>
      </Modal>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric label="Entradas registradas" value={entradas} icon={IconCheck} color="green" />
        <Metric label="Tardanzas" value={tardanzas} icon={IconAlertTriangle} color="yellow" />
        <Metric label="Solicitudes pendientes" value={pendientes} icon={IconFileText} color="blue" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>Mi informacion</Title>
              <Text fw={800} mt="sm">{usuario.nombre_completo}</Text>
              <Text c="dimmed">{trabajador?.area || 'Sin area'} - {trabajador?.cargo || 'Sin cargo'}</Text>
              <Text size="sm" mt="sm">DNI: <b>{trabajador?.dni || '-'}</b></Text>
              <Text size="sm">Telefono: <b>{trabajador?.telefono || '-'}</b></Text>
            </div>
            <ThemeIcon size={46} radius="xl" variant="light"><IconUser size={24} /></ThemeIcon>
          </Group>
        </Card>

        <Card withBorder>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>Mi fotocheck</Title>
              <Text size="sm" c="dimmed">Solo tu usuario puede ver este fotocheck y su QR firmado.</Text>
            </div>
            <ThemeIcon size={46} radius="xl" color="teal" variant="light"><IconQrcode size={24} /></ThemeIcon>
          </Group>
          <Paper withBorder mt="md" p="md" className="portal-fotocheck">
            {logoEmpresa && <img src={logoEmpresa} alt={nombreEmpresa} className="portal-fotocheck-logo" />}
            <Text fw={900} ta="center">{nombreEmpresa}</Text>
            {esloganEmpresa && <Text size="xs" c="dimmed" ta="center">{esloganEmpresa}</Text>}
            {trabajador?.url_foto ? (
              <img src={trabajador.url_foto} alt={trabajador.nombre_completo} className="portal-fotocheck-photo" />
            ) : (
              <div className="portal-fotocheck-photo empty"><IconUser size={42} /></div>
            )}
            <Text fw={900} ta="center" mt="xs">{trabajador?.nombre_completo || usuario.nombre_completo}</Text>
            <Text size="sm" ta="center">DNI: <b>{trabajador?.dni || '-'}</b></Text>
            <Text size="sm" c="dimmed" ta="center">{trabajador?.area || 'Sin area'} - {trabajador?.cargo || 'Sin cargo'}</Text>
            <div className="portal-fotocheck-qr">
              {qrPortal ? <img src={qrPortal} alt="QR de asistencia" className="portal-qr" /> : <Paper withBorder className="portal-qr-placeholder"><IconQrcode size={46} /><Text size="sm" c="dimmed">Generando QR...</Text></Paper>}
            </div>
            <Group justify="center" mt="sm">
              <Button size="xs" onClick={generarQr} loading={qrCargando}>Actualizar QR</Button>
              <Button size="xs" variant="light" color="teal" onClick={() => setFotocheckPantallaCompleta(true)}>Ver pantalla completa</Button>
              {qrPortal && <Button size="xs" variant="light" component="a" href={qrPortal} download="mi-fotocheck-qr.png">Descargar QR</Button>}
            </Group>
          </Paper>
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Title order={3} mb="md">Mis asistencias</Title>
        <TablaSimpleAsistencias filas={datos.misAsistencias} />
      </Card>

      <Card withBorder>
        <Title order={3} mb="md">Mis solicitudes</Title>
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Tipo</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Respuesta</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{datos.misSolicitudes.slice(0, 8).map((s) => <Table.Tr key={s.id_solicitud}><Table.Td>{s.tipo}</Table.Td><Table.Td>{s.fecha_solicitud}</Table.Td><Table.Td><Text lineClamp={2}>{s.motivo}</Text></Table.Td><Table.Td><Badge color={colorSolicitud(s.estado)}>{s.estado}</Badge></Table.Td><Table.Td>{s.comentario || '-'}</Table.Td></Table.Tr>)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!datos.misSolicitudes.length && <Text size="sm" c="dimmed">Aun no tienes solicitudes registradas.</Text>}
      </Card>
    </Stack>
  );
}

function TablaSimpleAsistencias({ filas }) {
  const asistenciasPagina = usePaginacion(filas, 10);
  return <><Table.ScrollContainer minWidth={680}><Table striped><Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Hora</Table.Th><Table.Th>Estado</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{asistenciasPagina.filas.map((x) => <Table.Tr key={x.id_asistencia}><Table.Td>{x.fecha_asistencia}</Table.Td><Table.Td>{x.tipo_marcacion}</Table.Td><Table.Td>{fechaHora(x.marcado_en)}</Table.Td><Table.Td>{x.estado}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer><Paginador paginacion={asistenciasPagina} totalItems={filas.length} /></>;
}

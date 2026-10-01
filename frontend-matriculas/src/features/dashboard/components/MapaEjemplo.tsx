import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { MapPin, Loader2, Info } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { API_BASE_URL } from '../../../config/api';

interface PuntoMuestra {
  etiqueta: string;
  curso: string;
  comuna: string;
  direccion_geo: string;
  lat?: number;
  lon?: number;
}

// Centro aproximado de Valparaíso
const CENTRO_VALPO: [number, number] = [-33.045, -71.62];

// Geocodifica con Nominatim (OpenStreetMap). Respeta el límite de 1 req/seg.
async function geocodificar(q: string, cache: Map<string, [number, number] | null>): Promise<[number, number] | null> {
  if (cache.has(q)) return cache.get(q)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    const r = Array.isArray(data) && data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number] : null;
    cache.set(q, r);
    return r;
  } catch {
    cache.set(q, null);
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MapaEjemplo({ anio }: { anio?: string }) {
  const [puntos, setPuntos] = useState<PuntoMuestra[]>([]);
  const [colegio, setColegio] = useState('');
  const [cargando, setCargando] = useState(true);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState('');
  const cacheRef = useRef(new Map<string, [number, number] | null>());

  useEffect(() => {
    let cancelado = false;
    const token = localStorage.getItem('token');
    setCargando(true);
    setProgreso(0);

    (async () => {
      try {
        const params = new URLSearchParams();
        if (anio) params.append('anio', anio);
        params.append('limite', '12');
        const res = await fetch(`${API_BASE_URL}/dashboard/muestra-geo?${params.toString()}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('No se pudo cargar la muestra');
        const data = await res.json();
        if (cancelado) return;
        setColegio(data.nombre_colegio || '');
        const muestra: PuntoMuestra[] = data.muestra || [];

        // Geocodificar una por una (rate limit Nominatim: ~1/seg).
        const geocodificados: PuntoMuestra[] = [];
        for (let i = 0; i < muestra.length; i++) {
          if (cancelado) return;
          const coord = await geocodificar(muestra[i].direccion_geo, cacheRef.current);
          if (coord) geocodificados.push({ ...muestra[i], lat: coord[0], lon: coord[1] });
          setProgreso(Math.round(((i + 1) / muestra.length) * 100));
          if (i < muestra.length - 1) await sleep(1100);
        }
        if (!cancelado) { setPuntos(geocodificados); setCargando(false); }
      } catch (e: any) {
        if (!cancelado) { setError(e.message); setCargando(false); }
      }
    })();

    return () => { cancelado = true; };
  }, [anio]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-teal-700 to-emerald-700 text-white">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <MapPin size={20} /> Mapa de Georreferenciación (muestra)
        </h3>
        <p className="text-emerald-100 text-xs mt-0.5">
          Ejemplo con direcciones reales anonimizadas{colegio ? ` · ${colegio}` : ''}
        </p>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2 mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            Muestra demostrativa geolocalizada con <strong>OpenStreetMap</strong> (open source, sin costo
            ni exposición de datos a terceros). Las etiquetas usan iniciales para resguardar la identidad del menor.
          </span>
        </div>

        {cargando ? (
          <div className="h-[360px] flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded-lg">
            <Loader2 className="animate-spin mb-2" size={22} />
            <p className="text-sm">Geolocalizando direcciones... {progreso}%</p>
            <p className="text-[11px] text-gray-400 mt-1">(se consulta OpenStreetMap respetando su límite de uso)</p>
          </div>
        ) : error ? (
          <div className="h-[360px] flex items-center justify-center text-red-600 text-sm bg-red-50 rounded-lg">{error}</div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={CENTRO_VALPO} zoom={12} style={{ height: '360px', width: '100%' }} scrollWheelZoom={false}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {puntos.map((p, i) => (
                <CircleMarker key={i} center={[p.lat!, p.lon!]} radius={9}
                  pathOptions={{ color: '#047857', fillColor: '#10b981', fillOpacity: 0.8 }}>
                  <Popup>
                    <strong>{p.etiqueta}</strong> — {p.curso}<br />
                    <span style={{ color: '#666' }}>{p.comuna}</span>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        )}

        {!cargando && !error && (
          <p className="text-[11px] text-gray-500 mt-2 text-center">
            {puntos.length} alumnos georreferenciados de la muestra. Imagine esto con los ~14.000 estudiantes del SLEP.
          </p>
        )}
      </div>
    </div>
  );
}

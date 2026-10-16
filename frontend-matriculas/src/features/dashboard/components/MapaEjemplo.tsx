import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { MapPin, Loader2, Info } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { API_BASE_URL } from '../../../config/api';

interface PuntoGeo {
  etiqueta: string;
  curso: string;
  comuna: string;
  lat: number;
  lon: number;
}

// Centro aproximado de Valparaíso
const CENTRO_VALPO: [number, number] = [-33.045, -71.62];

export default function MapaEjemplo({ anio }: { anio?: string }) {
  const [puntos, setPuntos] = useState<PuntoGeo[]>([]);
  const [colegio, setColegio] = useState('');
  const [conCoords, setConCoords] = useState(0);
  const [totalGeo, setTotalGeo] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    const token = localStorage.getItem('token');
    setCargando(true);
    setError('');

    (async () => {
      try {
        const params = new URLSearchParams();
        if (anio) params.append('anio', anio);
        // Lee las coordenadas YA guardadas en la base (las calcula por detrás el
        // worker geocodificar_pendientes.py). No se geocodifica en el navegador:
        // es instantáneo y no depende del límite de OpenStreetMap.
        const res = await fetch(`${API_BASE_URL}/dashboard/puntos-geo?${params.toString()}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('No se pudieron cargar los puntos del mapa');
        const data = await res.json();
        if (cancelado) return;
        setColegio(data.nombre_colegio || '');
        setConCoords(data.con_coordenadas || 0);
        setTotalGeo(data.total_geocodificable || 0);
        setPuntos((data.puntos || []).filter((p: PuntoGeo) => p.lat && p.lon));
        setCargando(false);
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
          <MapPin size={20} /> Mapa de Georreferenciación
        </h3>
        <p className="text-emerald-100 text-xs mt-0.5">
          Alumnos georreferenciados{colegio ? ` · ${colegio}` : ''}
        </p>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2 mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            Mapa con <strong>OpenStreetMap</strong> (open source, sin costo). Las coordenadas se
            calculan por detrás y se leen desde el sistema. Las etiquetas usan iniciales para
            resguardar la identidad del menor.
          </span>
        </div>

        {cargando ? (
          <div className="h-[360px] flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded-lg">
            <Loader2 className="animate-spin mb-2" size={22} />
            <p className="text-sm">Cargando mapa...</p>
          </div>
        ) : error ? (
          <div className="h-[360px] flex items-center justify-center text-red-600 text-sm bg-red-50 rounded-lg">{error}</div>
        ) : puntos.length === 0 ? (
          <div className="h-[360px] flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded-lg text-center px-6">
            <MapPin size={24} className="mb-2 text-gray-400" />
            <p className="text-sm font-medium">Aún no hay alumnos georreferenciados.</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Las coordenadas se generan con el proceso de geocodificación. Una vez ejecutado,
              los alumnos aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={CENTRO_VALPO} zoom={12} style={{ height: '360px', width: '100%' }} scrollWheelZoom={false}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {puntos.map((p, i) => (
                <CircleMarker key={i} center={[p.lat, p.lon]} radius={9}
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
            {conCoords} de {totalGeo} alumnos con dirección geolocalizable ya georreferenciados.
          </p>
        )}
      </div>
    </div>
  );
}

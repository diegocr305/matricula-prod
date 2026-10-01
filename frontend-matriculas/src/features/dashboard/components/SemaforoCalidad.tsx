import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';

interface ColegioCalidad {
  id_establecimiento: number;
  rbd: string;
  nombre: string;
  total: number;
  con_direccion: number;
  con_apoderado: number;
  pct_direccion: number;
  pct_apoderado: number;
}

// Color segun umbral (semaforo): >=80 verde, >=40 amarillo, <40 rojo.
function colorBarra(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all duration-500 ${colorBarra(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-600 w-12 text-right">{pct}%</span>
    </div>
  );
}

export default function SemaforoCalidad({ anio }: { anio?: string }) {
  const [datos, setDatos] = useState<ColegioCalidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    setCargando(true);
    const params = new URLSearchParams();
    if (anio) params.append('anio', anio);
    fetch(`${API_BASE_URL}/dashboard/calidad-dato?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error('No se pudo cargar la calidad del dato'); return r.json(); })
      .then((d) => { setDatos(d.establecimientos || []); setCargando(false); })
      .catch((e) => { setError(e.message); setCargando(false); });
  }, [anio]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <ShieldCheck size={20} /> Semáforo de Calidad del Dato
        </h3>
        <p className="text-slate-300 text-xs mt-0.5">
          Completitud por establecimiento: dirección geolocalizable y apoderado registrado
        </p>
      </div>

      {cargando ? (
        <div className="p-10 flex items-center justify-center text-gray-500">
          <Loader2 className="animate-spin mr-2" size={18} /> Calculando calidad del dato...
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">{error}</div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left p-3 font-medium">Establecimiento</th>
                <th className="text-center p-3 font-medium w-20">Alumnos</th>
                <th className="text-left p-3 font-medium w-44">Dirección</th>
                <th className="text-left p-3 font-medium w-44">Apoderado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {datos.map((c) => (
                <tr key={c.id_establecimiento} className="hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-semibold text-gray-800 leading-tight">{c.nombre}</p>
                    <p className="text-[11px] text-gray-400">RBD {c.rbd}</p>
                  </td>
                  <td className="p-3 text-center font-bold text-gray-700">{c.total}</td>
                  <td className="p-3"><Barra pct={c.pct_direccion} /></td>
                  <td className="p-3"><Barra pct={c.pct_apoderado} /></td>
                </tr>
              ))}
              {datos.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-500">Sin datos para este periodo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 flex gap-4">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> ≥80%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-amber-500 inline-block" /> 40–79%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500 inline-block" /> &lt;40%</span>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarCheck, AlertTriangle, TrendingDown, TrendingUp, Users, School,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, LabelList,
} from 'recharts';
import { usePanelAsistencia } from './hooks/usePanelAsistencia';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const nf = new Intl.NumberFormat('es-CL');

export default function PanelAsistencia() {
  const { data, cargando, error } = usePanelAsistencia();

  const totalSemaforo = useMemo(() => {
    const s = data.semaforo;
    return s.rojo + s.amarillo + s.verde + s.revisar || 1;
  }, [data]);

  const tendenciaChart = useMemo(
    () => data.tendencia.map((t) => ({ mes: t.glosa?.slice(0, 3) ?? String(t.mes), pct: +(t.pct * 100).toFixed(1) })),
    [data],
  );

  const fmtItem = (r: { nombre: string; pct: number }) => {
    const limpio = r.nombre.replace(/\s*\(\d+\)\s*$/, '').trim();
    return {
      nombre: limpio.length > 38 ? `${limpio.slice(0, 37)}…` : limpio,
      pct: +(r.pct * 100).toFixed(1),
    };
  };

  // El ranking viene ordenado ascendente (peores primero).
  const peoresChart = useMemo(() => data.ranking.slice(0, 10).map(fmtItem), [data]);
  // Mejores: los últimos del ranking, mostrados de mayor a menor.
  const mejoresChart = useMemo(
    () => data.ranking.slice(-10).reverse().map(fmtItem),
    [data],
  );

  if (cargando) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-900 rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-medium text-sm">Cargando panel de asistencia...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl border border-red-200 p-8 text-center shadow-sm">
        <p className="text-red-700 font-bold text-lg mb-1">No se pudo cargar</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  const s = data.semaforo;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-blue-950 flex items-center gap-2">
            <CalendarCheck className="text-blue-900" size={26} /> Panel de Asistencia
          </h2>
          <p className="text-sm text-gray-500 font-medium">
            Monitoreo mensual de asistencia y riesgo escolar · Año {data.anio || '—'}
          </p>
        </div>
      </div>

      {/* Banner de cobertura (los alumnos por validar) */}
      {data.kpis.por_validar > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 shadow-sm">
          <AlertTriangle size={20} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">
              {nf.format(data.kpis.por_validar)} alumnos con matrícula pero sin asistencia cargada.
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Corresponden a estudiantes pendientes de validación con los establecimientos
              (reportados en el formulario de las escuelas). Al regularizarlos, la cobertura
              de asistencia se completa.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-r-lg shadow-sm border border-gray-200 border-l-4 border-l-blue-900">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Asistencia promedio</p>
          <p className="text-3xl font-black text-blue-950">{pct(data.kpis.pct_promedio)}</p>
          {data.variacion ? (
            <VariacionTendencia v={data.variacion} />
          ) : (
            <p className="text-[10px] text-gray-400 mt-0.5">Escolar · umbral {pct(data.umbral)}</p>
          )}
        </div>
        <div className="bg-white p-5 rounded-r-lg shadow-sm border border-gray-200 border-l-4 border-l-red-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">En riesgo (rojo)</p>
          <p className="text-3xl font-black text-red-600">{nf.format(s.rojo)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{((s.rojo / totalSemaforo) * 100).toFixed(1)}% de los alumnos</p>
        </div>
        <div className="bg-white p-5 rounded-r-lg shadow-sm border border-gray-200 border-l-4 border-l-amber-500">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Alerta (amarillo)</p>
          <p className="text-3xl font-black text-amber-500">{nf.format(s.amarillo)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{((s.amarillo / totalSemaforo) * 100).toFixed(1)}% de los alumnos</p>
        </div>
        <div className="bg-white p-5 rounded-r-lg shadow-sm border border-gray-200 border-l-4 border-l-emerald-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Estudiantes</p>
          <p className="text-3xl font-black text-emerald-700">{nf.format(data.kpis.alumnos)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">con asistencia registrada</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Semáforo */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-extrabold text-gray-800 uppercase tracking-wide border-b border-gray-200 pb-3 mb-4 flex items-center gap-2">
            <Users size={20} className="text-blue-900" /> Semáforo de riesgo
          </h3>
          <div className="space-y-4">
            <BarraSemaforo label="🔴 Rojo — crítico" valor={s.rojo} total={totalSemaforo} color="bg-red-500" texto="text-red-700" />
            <BarraSemaforo label="🟡 Amarillo — atención" valor={s.amarillo} total={totalSemaforo} color="bg-amber-500" texto="text-amber-600" />
            <BarraSemaforo label="🟢 Verde — sano" valor={s.verde} total={totalSemaforo} color="bg-emerald-500" texto="text-emerald-700" />
            {s.revisar > 0 && (
              <BarraSemaforo label="⚪ Revisar — posible retiro" valor={s.revisar} total={totalSemaforo} color="bg-gray-400" texto="text-gray-600" />
            )}
          </div>
          <div className="mt-5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <strong>Regla (explicable):</strong> rojo = promedio bajo 70% o 3+ meses bajo 70%;
            amarillo = bajo el umbral de {pct(data.umbral)}. No es un modelo de caja negra.
          </div>
        </div>

        {/* Tendencia mensual */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-5 border-b border-gray-100 rounded-t-xl bg-blue-950 text-white">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <TrendingDown size={20} /> Evolución mensual
            </h3>
          </div>
          <div className="p-6 flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={tendenciaChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontWeight: 600, fontSize: 12 }} />
                <YAxis domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="pct" stroke="#1E3A8A" strokeWidth={3} dot={{ r: 4, fill: '#1E3A8A' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="px-6 py-3 bg-gray-50 rounded-b-xl border-t border-gray-100 text-xs text-gray-500 text-center">
            Promedio de asistencia escolar por mes.
          </div>
        </div>
      </div>

      {/* Ranking por establecimiento (solo vista SLEP): mejores y peores */}
      {peoresChart.length > 0 && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <RankingBar
              titulo="Mayor asistencia (destacados)"
              icono={<TrendingUp size={20} className="text-emerald-700" />}
              datos={mejoresChart}
            />
            <RankingBar
              titulo="Menor asistencia (a reforzar)"
              icono={<School size={20} className="text-red-700" />}
              datos={peoresChart}
            />
          </div>
          <p className="text-[11px] text-gray-400">
            Jardines VTF y modalidad adultos/especial se analizan por separado y no entran a este comparativo.
          </p>
        </>
      )}

      <p className="text-center text-xs text-gray-400 pt-2">
        Datos de asistencia {data.anio} · Indicadores agregados, sin información personal de estudiantes.
      </p>
    </div>
  );
}

function BarraSemaforo({ label, valor, total, color, texto }:
  { label: string; valor: number; total: number; color: string; texto: string }) {
  const p = (valor / total) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className={`font-bold ${texto}`}>{label}</span>
        <span className={`font-black ${texto}`}>{nf.format(valor)} ({p.toFixed(1)}%)</span>
      </div>
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function VariacionTendencia({ v }: {
  v: { mes_actual: string; mes_anterior: string; delta_pp: number };
}) {
  const sube = v.delta_pp > 0.05;
  const baja = v.delta_pp < -0.05;
  const Icono = sube ? ArrowUpRight : baja ? ArrowDownRight : Minus;
  const color = sube ? 'text-emerald-600' : baja ? 'text-red-600' : 'text-gray-400';
  const signo = v.delta_pp > 0 ? '+' : '';
  return (
    <div className={`flex items-center gap-1 mt-0.5 text-xs font-bold ${color}`} title={`${v.mes_actual} vs ${v.mes_anterior}`}>
      <Icono size={14} />
      <span>{signo}{v.delta_pp.toFixed(1)} pp</span>
      <span className="text-gray-400 font-medium">vs {v.mes_anterior}</span>
    </div>
  );
}

function RankingBar({ titulo, icono, datos }:
  { titulo: string; icono: ReactNode; datos: { nombre: string; pct: number }[] }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-extrabold text-gray-800 uppercase tracking-wide border-b border-gray-200 pb-3 mb-4 flex items-center gap-2">
        {icono} {titulo}
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(320, datos.length * 46)}>
        <BarChart data={datos} layout="vertical" margin={{ top: 5, right: 48, left: 10, bottom: 5 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis type="category" dataKey="nombre" width={260} interval={0}
            tick={{ fill: '#1f2937', fontSize: 12, fontWeight: 600 }} />
          <Tooltip formatter={(v) => [`${v}%`, 'Asistencia']} cursor={{ fill: '#F9FAFB' }}
            contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={22}>
            {datos.map((e, i) => (
              <Cell key={i} fill={e.pct < 70 ? '#DC2626' : e.pct < 85 ? '#F59E0B' : '#059669'} />
            ))}
            <LabelList dataKey="pct" position="right" formatter={(v: any) => `${v}%`}
              style={{ fill: '#374151', fontSize: 12, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

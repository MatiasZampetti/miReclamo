'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowRight, MapPin, Calendar, Tag } from 'lucide-react';
import type { MapComplaint, MapConfig } from '@/lib/api-client';
import {
  URGENCY_HEX,
  URGENCY_FALLBACK,
  URGENCY_LABELS,
  STATUS_LABELS,
  formatDate,
} from '@/lib/utils';
import 'leaflet/dist/leaflet.css';

interface Props {
  complaints: MapComplaint[];
  config: MapConfig;
}

/**
 * Varios reclamos pueden caer en la misma coordenada (misma dirección, o la
 * geocodificación devolvió el centro de la cuadra). Sin esto quedarían
 * perfectamente superpuestos y solo se podría clickear el último.
 * Los desparramamos en un círculo chico, de forma determinística.
 */
function spread(complaints: MapComplaint[]): Array<MapComplaint & { pos: [number, number] }> {
  const groups = new Map<string, MapComplaint[]>();
  for (const c of complaints) {
    const key = `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const out: Array<MapComplaint & { pos: [number, number] }> = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push({ ...group[0], pos: [group[0].latitude, group[0].longitude] });
      continue;
    }
    const radius = 0.00016; // ~18 m
    group.forEach((c, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      out.push({
        ...c,
        pos: [
          c.latitude + radius * Math.sin(angle),
          c.longitude + radius * Math.cos(angle) * 1.2, // corrige el achatamiento por longitud
        ],
      });
    });
  }
  return out;
}

/** Encuadra el mapa sobre los reclamos cargados. */
function FitToComplaints({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 17 });
  }, [map, points]);

  return null;
}

export default function ComplaintsMap({ complaints, config }: Props) {
  const points = useMemo(() => spread(complaints), [complaints]);
  const bounds = useMemo(
    () => points.map((p) => p.pos as [number, number]),
    [points],
  );

  return (
    <MapContainer
      center={[config.center_lat, config.center_lng]}
      zoom={config.default_zoom}
      scrollWheelZoom
      className="h-full w-full"
      // El contenedor tiene su propio fondo mientras cargan los tiles
      style={{ background: 'hsl(var(--muted))' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <FitToComplaints points={bounds} />

      {points.map((c) => {
        const color = c.urgency ? URGENCY_HEX[c.urgency] : URGENCY_FALLBACK;
        // Los urgentes se dibujan un poco más grandes para que salten a la vista
        const radius = c.urgency === 'high' ? 11 : c.urgency === 'medium' ? 9 : 8;
        const cerrado = c.status === 'resolved' || c.status === 'rejected';

        return (
          <CircleMarker
            key={c.id}
            center={c.pos}
            radius={radius}
            pathOptions={{
              color: color.stroke,
              weight: 2,
              fillColor: color.fill,
              // Relleno siempre sólido: el color de urgencia tiene que leerse
              // igual de fuerte sobre cualquier zona del mapa.
              fillOpacity: 1,
              opacity: 1,
              // Los cerrados se distinguen por el borde punteado, no por transparencia
              dashArray: cerrado ? '3 3' : undefined,
            }}
          >
            <Popup className="complaint-popup" minWidth={268} maxWidth={300}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: color.fill }}
                  >
                    {c.urgency ? URGENCY_LABELS[c.urgency] : 'Sin clasificar'}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>

                <p className="text-sm font-semibold leading-snug text-foreground">{c.summary}</p>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {c.location && (
                    <p className="flex items-start gap-1.5">
                      <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>{c.location}</span>
                    </p>
                  )}
                  {c.category?.name && (
                    <p className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 shrink-0" />
                      <span>{c.category.name}</span>
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatDate(c.created_at)}</span>
                  </p>
                </div>

                <Link
                  href={`/complaints/${c.id}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Ver más detalles
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

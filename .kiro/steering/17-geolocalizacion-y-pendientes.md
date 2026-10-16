# Geolocalización por cola + Pendientes de despliegue

Estado: IMPLEMENTADO en código (en `prod/main`), PENDIENTE de desplegar en el
servidor (restart backend + build frontend). Documenta dos cosas: (1) el flujo de
geolocalización de direcciones por cola, y (2) los cambios ya commiteados que faltan
aplicar en el servidor (auditoría de ficha y geolocalización).

---

## 1. Geolocalización por COLA (dirección del ALUMNO)

### Problema que resuelve
El mapa del Panel de Control (`MapaEjemplo.tsx`) antes geocodificaba al vuelo en el
navegador de cada usuario con Nominatim/OpenStreetMap. Nominatim público limita
~1 request/seg y puede bloquear la IP; con varios usuarios validando a la vez era
frágil, y además el mapa no reflejaba las ediciones (geocodificaba texto, no leía
coordenadas guardadas). Nota: el mapa SIEMPRE usó la dirección del **estudiante**
(`estudiante.calle/numero/sector/comuna/domicilio`), nunca la del apoderado.

### Arquitectura (decidida con el dueño)
Geocodificar POR DETRÁS, guardar lat/lon en `estudiante`, y que el Panel solo LEA.
Las columnas `estudiante.latitud`, `longitud`, `geo_precision` (varchar, nullable)
ya existían; no hubo migración de esquema.

1. **Marcar, no geocodificar (al editar/crear ficha).**
   `actualizar_datos_estudiante_db` (estudiante_service.py): si la dirección del
   alumno CAMBIA, el UPDATE pone `latitud=NULL, longitud=NULL, geo_precision=NULL`.
   Así el alumno entra a la "cola" sin llamar a OSM al guardar (instantáneo, sin
   riesgo de bloqueo aunque validen 2 personas a la vez). Si la dirección no cambia,
   no toca las coordenadas.
   - "Pendiente de geocodificar" = `latitud IS NULL` + domicilio con número
     (`domicilio ~ '[0-9]'`) + comuna no vacía + con matrícula. No hay flag extra.

2. **Worker MANUAL que procesa la cola 1/seg.**
   `backend/produccion/geocodificar_pendientes.py` (DRY-RUN por defecto).
   Toma los pendientes, limpia la dirección con `limpiar_direccion_geo` (quita
   'Cerro X', ruido, etc. — mejora la tasa de aciertos de OSM), consulta Nominatim
   UNO POR UNO con pausa ~1.1s y `User-Agent` válido (OSM lo exige), y guarda
   lat/lon + `geo_precision='osm'`. Un solo proceso secuencial => nunca supera el
   límite, sin importar cuántos editen. Idempotente: re-ejecutar solo toma los que
   siguen sin coordenadas.
   ```
   # desde backend/ en el servidor:
   python produccion/geocodificar_pendientes.py --establecimiento 17 --limite 10      # DRY-RUN
   python produccion/geocodificar_pendientes.py --apply --establecimiento 17 --limite 700
   ```
   A ~1.1s/alumno, 669 del 1520 tardan ~12-13 min. Flags: `--apply`, `--limite`,
   `--establecimiento`, `--pausa`.

3. **El Panel solo LEE coordenadas.**
   Nuevo endpoint `GET /dashboard/puntos-geo` + `obtener_puntos_geo_db`
   (dashboard_service.py): devuelve SOLO alumnos con lat/lon ya guardados
   (anonimizado: iniciales + curso + comuna), más `con_coordenadas` /
   `total_geocodificable` para mostrar cobertura. Instantáneo, sin OSM.
   `MapaEjemplo.tsx` ahora llama a `/puntos-geo` (ya NO geocodifica en el cliente);
   muestra vista vacía amable si aún no hay coordenadas.
   El endpoint legado `/dashboard/muestra-geo` (geocodifica al vuelo) se mantiene por
   compatibilidad pero ya no lo usa el mapa.

### Estado del dato (medido oct 2026)
`estudiante`: 412 con lat/lon, 33.762 sin. El mapa muestra los que tengan
coordenadas; irán apareciendo a medida que se corra el worker.

### Decisiones y pendientes
- Worker **manual** por ahora (no cron). Si funciona bien, evaluar automatizar.
- Nominatim **público** por ahora (con la cola 1/seg). Para los ~14.000 del SLEP
  completo, lo correcto es **auto-hospedar Nominatim** (sin límite, sin exponer datos
  de menores a OSM) — ver steering 07. Dejado para después por decisión del dueño.
- El marcado "pendiente al editar" aplica de aquí en adelante; los que ya tenían
  coordenadas no se re-tocan salvo que se les edite la dirección.

---

## 2. PENDIENTE: desplegar en el servidor (restart + build)

Hay cambios ya en `prod/main` que FALTA aplicar en el servidor. Hacerlo en ventana
sin usuarios (idealmente de noche): el `restart` del backend corta la API unos
segundos (el frontend/página no se cae).

### 2a. Fix de AUDITORÍA de ficha (cambio de BACKEND — requiere restart)
Commit: "Auditoria de ficha: registrar cambios de domicilio + apoderado + salud...".
Antes la auditoría de editar ficha solo guardaba el domicilio del alumno; cambios de
apoderado/salud no quedaban y, si el domicilio no cambiaba, salía "sin cambios"
aunque se tocaran otros campos; además registraba evento sin cambios. Ahora
(`_snapshot_ficha` + `_registrar_auditoria_estudiante` en estudiante_service.py y
`clasificar_evento` en reporte_service.py): audita domicilio + apoderado titular/
suplente + salud, SOLO si hubo cambio real, con resumen legible. Privacidad: domicilio
del alumno con valores; apoderado/salud solo los nombres de campo cambiados.
=> **Falta**: `git pull` + `sudo systemctl restart matriculas-backend`.

### 2b. Geolocalización por cola (BACKEND + FRONTEND)
Commit: "Geolocalizacion por cola...". Requiere restart backend (endpoint nuevo +
marcado en edición) y build frontend (mapa que lee /puntos-geo).

### Comando de despliegue (ambos cambios juntos)
```
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
sudo systemctl restart matriculas-backend
sudo journalctl -u matriculas-backend -n 30     # verificar que arrancó sin error
cd frontend-matriculas && npm ci && npm run build
```
No hay migraciones de BD. Tras el build, Ctrl+F5 no es necesario para quien recargue
(ya se configuró el no-cache del index.html en Nginx, ver steering 04).

### Checklist post-deploy
1. Editar una ficha y cambiar el teléfono de un apoderado -> en Trazabilidad debe
   aparecer "Apoderado titular (telefono)". Guardar sin cambios -> NO debe crear evento.
2. Editar la dirección de un alumno -> queda pendiente de geocodificar (lat/lon NULL).
3. Correr el worker (`--apply --establecimiento 17`) y verificar que el mapa del Panel
   muestra los puntos (cobertura "N de M").

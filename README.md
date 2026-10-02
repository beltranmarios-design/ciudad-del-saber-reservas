# Movilidad del campus — Fundación Ciudad del Saber

Aplicación web para gestionar bicicletas y scooters compartidos entre las 8 estaciones del campus. Todo el alcance es **frontend con datos locales (localStorage)**: sin backend, sin autenticación real, sin integraciones externas.

## Stack
React 19 · TypeScript · TanStack Start/Router · Tailwind CSS v4 · Vitest. Fuentes Nunito (títulos) e Inter (texto) con alternativas sans-serif (`display=swap`, no bloquean).

## Comandos
```bash
bun install        # o npm install
bun run dev        # desarrollo (http://localhost:8080)
bun run build      # compilación
bun run test       # pruebas de lógica (vitest)
```

## Estructura
```
src/lib/mobility/types.ts      Modelo de datos y códigos de error
src/lib/mobility/constants.ts  Clave de almacenamiento, clave de operaciones, configuración inicial
src/lib/mobility/seed.ts       Datos de demostración (fechas relativas a la primera carga)
src/lib/mobility/rules.ts      Reglas de negocio PURAS (retiro, devolución, flota, horario, redistribución)
src/lib/mobility/storage.ts    Adaptador de persistencia (único punto que toca localStorage)
src/lib/mobility/store.tsx     Contexto React: re-lee, aplica operación, guarda, y solo entonces actualiza la UI
src/lib/i18n.tsx               Diccionario centralizado ES/EN y formato de fechas (America/Panama)
src/routes/                    Pantallas: / (estaciones), /checkout, /loan, /history, /ops/*
src/test/mobility.test.ts      Pruebas de aceptación
```

## Usuarios de demostración
| Credencial | Nombre | Estado |
|---|---|---|
| CDS-1001 | Ana Lucía Pérez | activo, préstamo activo |
| CDS-1002 | Marco Delgado | activo, préstamo activo **excedido** (>2 h) |
| CDS-1003 | Sofía Herrera | activo, préstamo activo (scooter) |
| CDS-1004 | Daniel Ortega | activo, préstamo activo |
| CDS-1005 | Valentina Ríos | activo, préstamo activo (scooter) |
| CDS-1006 | Tomás Quintero | **inactivo** con préstamo activo (puede devolver, no retirar) |
| CDS-1007, CDS-1008, CDS-1010 | — | activos sin préstamo (para probar retiros) |
| CDS-1009 | Lucía Bermúdez | inactivo |

Todos los nombres, organizaciones y credenciales son ficticios.

## Acceso de operaciones
Clave local: **`operaciones2026`**, definida en `OPS_ACCESS_KEY` (`src/lib/mobility/constants.ts`). Cámbiala ahí. Se guarda la sesión en `sessionStorage`. **Es solo una demostración, no es seguridad**: la clave viaja en el bundle.

## Modelo de datos
Organización, Usuario, Estación (capacidad, posición esquemática), Vehículo (código, tipo, estado `available|loaned|maintenance|charging`, estación o `null` si está prestado, batería solo scooters), Préstamo (retiro, límite, devolución, duración, `overdue`), Movimiento operativo, Configuración. Ocupación, plazas libres y disponibilidad **se calculan siempre** a partir de los vehículos; no hay contadores.

## Reglas
- **Ocupación física** = vehículos presentes (incluye mantenimiento y carga). **Plazas libres** = capacidad − ocupación (nunca negativa). Prestados no ocupan plaza.
- **Disponibles**: estado disponible; scooters además con batería **> 20 %** (20 % exacto no es elegible).
- **Asignación**: bicicletas por código ascendente; scooters por mayor batería, empate por código.
- **Retiro** valida: credencial existe, usuario activo, sin préstamo activo, dentro de horario, vehículo elegible. Se revalida al confirmar sobre el estado recién leído; botón protegido contra doble envío.
- **Préstamo**: máximo 120 min. Excedido solo si la duración es **estrictamente mayor**. Calculado por timestamps (sobrevive a recargas); se refresca cada segundo y al recuperar el foco. La marca se guarda en el historial.
- **Devolución**: cualquier estación con plaza; si está llena se bloquea y se sugieren alternativas. Scooters requieren batería simulada 0–100 entera; ≤ umbral → queda **en carga**.
- **Flota**: no se puede modificar un vehículo prestado; un scooter no puede pasar a disponible con batería ≤ umbral; editar batería ≤ umbral a un scooter disponible lo pasa a carga.
- **Capacidad** no puede reducirse por debajo de la ocupación física.
- **Redistribución**: orígenes con ocupación **> 80 %**, destinos **< 20 %** (estrictos). Destinos por menor ocupación (empate por orden de estación); orígenes por mayor ocupación. Solo se mueven vehículos elegibles. Se planifica sobre una copia actualizada tras cada movimiento (sin repetir vehículos), acercando ambos lados al 50 % hasta donde lo permiten capacidad y vehículos. Al confirmar se recalcula; si la sugerencia ya no existe se avisa de plan desactualizado.

## Horario
Lunes a viernes 07:00–20:00, zona **America/Panama** (calculada con `Intl`, nunca con la zona del dispositivo). Retiros desde 07:00 y antes de 20:00. **Criterio de implementación**: las **devoluciones se permiten siempre**, también fuera de horario, para poder recuperar vehículos (decisión centralizada en `isServiceOpen`, que solo usa el retiro). En *Operaciones → Configuración* hay un **reloj de demostración** (automático / forzar abierto / forzar cerrado), señalado con un aviso visible en toda la app cuando está activo.

## Qué está simulado
Identificación por credencial, acceso de operaciones, desbloqueo, batería de devolución, carga de scooters y movimientos de redistribución. No hay GPS, mapas externos, IoT, pagos ni notificaciones. El mapa es esquemático e ilustrativo.

## Reiniciar datos
*Operaciones → Configuración → Reiniciar datos de demostración* (con confirmación). Los datos se generan solo cuando no existen (`campus_mobility_v1`); recargar no los regenera.

## Persistencia y limitaciones
- Cada operación: re-lee el estado guardado → valida → aplica la función pura → guarda el estado completo → solo entonces muestra éxito. Si el guardado falla (cuota, bloqueo) se informa y no se aplica nada.
- JSON corrupto o inválido **no se sobrescribe**: se ofrece descargar una copia, reintentar o reiniciar con confirmación.
- Se escuchan eventos `storage` para sincronizar entre pestañas.
- localStorage **no es un backend transaccional**: no hay garantías de concurrencia multiusuario ni seguridad.

## Pruebas (`src/test/mobility.test.ts`)
1 doble préstamo · 2 devolución a estación llena sin cambios · 3 devolución a otra estación · 4 scooter de mayor batería · 5 batería ≤ 20 % no asignable · 6 mantenimiento no disponible · 7 excedido > 2 h (2 h exactas no) · 8 marca conservada en historial · 9 redistribución >80 % → <20 % · 10 límites exactos 80/20 · 11 capacidad y sin repetir vehículos · 12 plazas tras retiro/devolución · 13 persistencia tras recarga · 14 flota 40+20 · 15 horario en America/Panama · 16 fallo de guardado sin confirmación falsa · extra: JSON corrupto no se sobrescribe.

## Conectar un backend real (Kodarvia)
1. Sustituir `storage.ts` por un cliente API manteniendo `commitOperation` (pasa a una llamada transaccional del servidor).
2. Mover `rules.ts` al servidor como fuente de verdad (las funciones son puras y reutilizables) con bloqueo/transacciones por vehículo y estación.
3. Reemplazar credencial simulada y `OPS_ACCESS_KEY` por autenticación real y roles en tabla separada.
4. Integrar cerraduras/telemetría de batería si procede; añadir políticas legales y despliegue.

## Correcciones de la revisión (v2 de datos)

- **Batería al 20 %**: un scooter solo es retirable si está estacionado, en estado *Disponible* y con batería **> 20 %** (`isEligible`, única función usada por contadores, mapa, selección y validación final). En los datos iniciales SCO-003 y SCO-016 (20 %) pasan a *En carga*. Devolver con ≤ 20 % lo deja en carga. Si se sube el umbral en Configuración, los scooters estacionados afectados pasan a carga.
- **Migración versionada**: los datos guardados con `version: 1` se migran a `version: 2` al cargar, sin borrar nada: solo los scooters **estacionados y disponibles** con batería ≤ umbral pasan a *En carga*. Préstamos, historial, movimientos, ubicaciones y demás cambios se conservan; vehículos prestados o en mantenimiento no se tocan.
- **Fechas de demostración**: todas las retiradas precargadas caen dentro del horario real (lun–vie 07:00–20:00, America/Panama). Los préstamos activos se anclan al último minuto de servicio anterior a la carga; si se abre la app de noche o en fin de semana aparecen **vencidos**, sin maquillar fechas. Duración y vencimiento se calculan desde las fechas reales. Los datos ya guardados no se re-fechan (usa *Reiniciar datos* para regenerarlos).
- **Reloj de demostración**: con *Forzar abierto/cerrado* aparece en todas las pantallas el aviso «Modo demostración: servicio forzado abierto/cerrado» (y en inglés), con estilo azul discontinuo distinto del estado real. *Automático* (hora de Panamá) es el valor inicial.
- **Retirada**: el primer paso avisa si el servicio está cerrado (horario y zona horaria) o si no hay vehículos elegibles del tipo elegido, y bloquea *Continuar*. Una credencial con préstamo activo muestra el motivo y un enlace a *Mi préstamo*. La validación final se mantiene. Las devoluciones no se bloquean.
- **Mapa**: leyenda que explica que la cifra son vehículos disponibles para retirar (según el filtro) y que el color es la ocupación. Las tarjetas muestran por separado Disponibles, Ocupación y Plazas libres (= capacidad − ocupación). Los nombres largos se parten en varias líneas; el nombre completo se consulta tocando o pulsando Intro en el marcador.
- **Plurales y errores**: formas singular/plural (`{n:singular|plural}`) en ES/EN; mensajes de configuración específicos junto al campo (p. ej. «El umbral alto de ocupación debe ser mayor que el umbral bajo»), conservando los valores introducidos.

Pruebas: `bunx vitest run` (incluye baterías 19/20/21 %, migración, fechas coherentes, consistencia de contadores y plurales).

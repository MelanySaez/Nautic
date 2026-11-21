/**
 * WebGL canvas of the hull view (React Three Fiber). Lazy-loaded by `EscenaCasco`: this module and
 * the ones only it imports are the only ones allowed to reach three.js, so it stays out of the
 * entry chunk. jsdom has no WebGL, so its logic lives in the pure helpers of `vistaCasco.ts` and
 * `coloresZona.ts`; the scene itself is checked by hand in a browser.
 */
import { Edges, Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as EventoPunteroReact,
  type Ref,
} from 'react'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, type MeshStandardMaterial, type Vector3 } from 'three'
import { generarCasco, type CascoGenerado } from '../../../buques/domain/casco/geometria'
import type { Malla, Vec3 } from '../../../buques/domain/casco/malla'
import type { CodigoZona } from '../../../buques/domain/casco/zonas'
import { colorDivisor, mezclarColores, useColoresTema, variableDeZona } from './coloresZona'
import { PRESENTACION_ESTADO_ZONA } from './estadosZona'
import type { PropsLienzoCasco } from './lienzoCasco'
import {
  ASPECTO_POR_DEFECTO,
  CAMPO_VISION_GRADOS,
  DURACION_COLOR_MS,
  DURACION_ENTRADA_MS,
  DURACION_VISTA_MS,
  VISTAS_CAMARA,
  centroDeCaja,
  distanciaDeEncuadre,
  duracionMovimiento,
  esArrastre,
  interpolarOrbita,
  limitesDeDistancia,
  miraHaciaCamara,
  posicionDeVista,
  progreso,
  puntoDeInsignia,
  suavizar,
  useMovimientoReducido,
  type NombreVista,
} from './vistaCasco'

/** Share of ink mixed into the surface colour for what is not a zone: deck, transom, superstructure. */
const MEZCLA_NEUTRA = 0.2
/** Used only when a token cannot be read. */
const GRIS_RESPALDO = '#8a94a6'
const TINTA_RESPALDO = '#191c1e'
const ACENTO_RESPALDO = '#06b6d4'
/** Hover highlight: a white glow on top of the zone colour. */
const BRILLO_RESALTE = 0.28
/** How far a photo badge floats off the hull, as a share of the length. */
const SEPARACION_INSIGNIA = 0.012
const ORIGEN: Vec3 = [0, 0, 0]

const CLASES_CONTROL =
  'rounded border border-line bg-surface/90 px-2 py-1 font-mono text-[11px] font-medium tracking-wider text-ink-muted uppercase shadow-sm transition-colors hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const tupla = (v: Vec3): [number, number, number] => [v[0], v[1], v[2]]

interface ZonaEscena {
  codigo: CodigoZona
  geometria: BufferGeometry
  insignia: { punto: Vec3; normal: Vec3 } | null
}

interface PiezasEscena {
  zonas: ZonaEscena[]
  /** Deck, transom and superstructure: drawn neutral, never selected. */
  inertes: BufferGeometry[]
}

/** A three.js geometry over the arrays of a generated mesh: they are shared, not copied. */
function geometriaDe(malla: Malla): BufferGeometry {
  const geometria = new BufferGeometry()
  geometria.setAttribute('position', new BufferAttribute(malla.posiciones, 3))
  geometria.setAttribute('normal', new BufferAttribute(malla.normales, 3))
  geometria.setIndex(new BufferAttribute(malla.indices, 1))
  geometria.computeBoundingSphere()
  return geometria
}

function piezasDeEscena(casco: CascoGenerado, eslora: number): PiezasEscena {
  const conTriangulos = (malla: Malla) => malla.indices.length > 0
  return {
    zonas: casco.zonas.filter(conTriangulos).map((zona) => ({
      codigo: zona.codigo,
      geometria: geometriaDe(zona),
      insignia: puntoDeInsignia(zona, SEPARACION_INSIGNIA * eslora),
    })),
    inertes: [...casco.neutras, ...casco.decorativas].filter(conTriangulos).map(geometriaDe),
  }
}

function liberar({ zonas, inertes }: PiezasEscena) {
  for (const zona of zonas) zona.geometria.dispose()
  for (const geometria of inertes) geometria.dispose()
}

interface EventosMalla {
  onPointerOver: (evento: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (evento: ThreeEvent<PointerEvent>) => void
  onClick: (evento: ThreeEvent<MouseEvent>) => void
}

/**
 * Material colour that blends to `objetivo` (from `inicial` on mount, from the current colour
 * afterwards) over `duracionMs`; at once when the duration is 0 (reduced motion).
 */
function useColorAnimado(objetivo: string, inicial: string, duracionMs: number) {
  const material = useRef<MeshStandardMaterial>(null)
  const animacion = useRef<{ desde: Color; hasta: Color; inicio: number | null } | null>(null)
  const iniciado = useRef(false)
  const invalidate = useThree((estado) => estado.invalidate)

  useLayoutEffect(() => {
    const actual = material.current
    if (!actual) return
    if (!iniciado.current) {
      actual.color.set(inicial)
      iniciado.current = true
    }
    const hasta = new Color(objetivo)
    if (duracionMs <= 0 || actual.color.equals(hasta)) {
      actual.color.copy(hasta)
      animacion.current = null
    } else {
      animacion.current = { desde: actual.color.clone(), hasta, inicio: null }
    }
    invalidate()
  }, [objetivo, inicial, duracionMs, invalidate])

  useFrame((estado) => {
    const mezcla = animacion.current
    const actual = material.current
    if (!mezcla || !actual) return
    const ahora = performance.now()
    mezcla.inicio ??= ahora
    const p = progreso(ahora - mezcla.inicio, duracionMs)
    actual.color.lerpColors(mezcla.desde, mezcla.hasta, suavizar(p))
    if (p < 1) estado.invalidate()
    else animacion.current = null
  })

  return material
}

function MallaCasco({
  geometria,
  color,
  colorInicial,
  duracionColor,
  resaltada = false,
  contorno = null,
  divisor = null,
  eventos,
}: {
  geometria: BufferGeometry
  color: string
  colorInicial: string
  duracionColor: number
  resaltada?: boolean
  /** Colour of the selection outline; none when not selected. */
  contorno?: string | null
  /** Colour of the thin border every zone keeps, so zones in the same state stay apart. */
  divisor?: string | null
  eventos: EventosMalla
}) {
  const material = useColorAnimado(color, colorInicial, duracionColor)
  return (
    <mesh geometry={geometria} {...eventos}>
      {/* The polygon offset pushes the faces back so the selection outline on them always wins. */}
      <meshStandardMaterial
        ref={material}
        emissive="#ffffff"
        emissiveIntensity={resaltada ? BRILLO_RESALTE : 0}
        roughness={0.75}
        metalness={0}
        side={DoubleSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
      {contorno ? (
        <Edges threshold={20} color={contorno} lineWidth={3} />
      ) : (
        divisor && <Edges threshold={20} color={divisor} lineWidth={1} />
      )}
    </mesh>
  )
}

/** Photo count of a zone, hidden while its side of the hull faces away from the camera. */
function InsigniaFotos({
  punto,
  normal,
  centro,
  cantidad,
}: {
  punto: Vec3
  normal: Vec3
  centro: Vec3
  cantidad: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFrame(({ camera }) => {
    const insignia = ref.current
    if (!insignia) return
    // The hull is drawn shifted by -centro, so the camera in hull coordinates is shifted by +centro.
    const camara: Vec3 = [camera.position.x + centro[0], camera.position.y + centro[1], camera.position.z + centro[2]]
    insignia.style.opacity = miraHaciaCamara(punto, normal, camara) ? '1' : '0'
  })
  return (
    <Html ref={ref} position={tupla(punto)} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span
        aria-hidden="true"
        className="block rounded-full border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold text-ink tabular-nums shadow-sm select-none"
      >
        {cantidad}
      </span>
    </Html>
  )
}

function PlanoFlotacion({ eslora, manga, calado, color }: { eslora: number; manga: number; calado: number; color: string }) {
  return (
    <mesh position={[eslora / 2, calado, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[eslora * 1.3, Math.max(manga * 3, eslora * 0.25)]} />
      <meshBasicMaterial color={color} transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

interface MandoCamara {
  irA: (vista: NombreVista) => void
}

interface MovimientoCamara {
  hasta: Vec3
  objetivoHasta: Vec3
  duracion: number
  /** Taken from the camera on the first frame of the move, so a late first frame does not jump. */
  desde?: Vec3
  objetivoDesde?: Vec3
  inicio?: number
}

/** What the moves need from drei's OrbitControls (three-stdlib), typed structurally. */
interface ControlesOrbita {
  target: Vector3
}

/**
 * Moves the camera around the hull: the fly-in from the silhouette's side view to the 3/4 view
 * on mount, and the presets on request. With reduced motion there is no fly-in and presets jump.
 */
function Camara({ ref, caja, reducido }: { ref: Ref<MandoCamara>; caja: CascoGenerado['caja']; reducido: boolean }) {
  const movimiento = useRef<MovimientoCamara | null>(null)
  const entrada = useRef(false)
  const invalidate = useThree((estado) => estado.invalidate)
  const aspecto = useThree((estado) => estado.size.width / Math.max(1, estado.size.height))
  const distancia = distanciaDeEncuadre(caja, CAMPO_VISION_GRADOS, aspecto)

  useEffect(() => {
    if (entrada.current) return
    entrada.current = true
    if (reducido) return
    movimiento.current = { hasta: posicionDeVista('3/4', distancia), objetivoHasta: ORIGEN, duracion: DURACION_ENTRADA_MS }
    invalidate()
  }, [reducido, distancia, invalidate])

  useImperativeHandle(
    ref,
    () => ({
      irA(vista) {
        movimiento.current = {
          hasta: posicionDeVista(vista, distancia),
          objetivoHasta: ORIGEN,
          duracion: duracionMovimiento(DURACION_VISTA_MS, reducido),
        }
        invalidate()
      },
    }),
    [distancia, reducido, invalidate],
  )

  // Runs after OrbitControls' own update (priority -1), so the move wins on every frame it lasts.
  useFrame((estado) => {
    const actual = movimiento.current
    if (!actual) return
    const { camera } = estado
    const controles = estado.controls as unknown as ControlesOrbita | null
    const ahora = performance.now()
    if (actual.inicio === undefined) {
      actual.inicio = ahora
      actual.desde = [camera.position.x, camera.position.y, camera.position.z]
      actual.objetivoDesde = controles ? [controles.target.x, controles.target.y, controles.target.z] : ORIGEN
    }
    const p = progreso(ahora - actual.inicio, actual.duracion)
    const { posicion, objetivo } = interpolarOrbita(
      actual.desde ?? actual.hasta,
      actual.hasta,
      actual.objetivoDesde ?? ORIGEN,
      actual.objetivoHasta,
      suavizar(p),
    )
    camera.position.set(...posicion)
    controles?.target.set(...objetivo)
    camera.lookAt(...objetivo)
    if (p < 1) estado.invalidate()
    else movimiento.current = null
  })

  return null
}

/**
 * The hull in 3D, one clickable mesh per placed zone, coloured by its state. Hover highlights a
 * zone and labels it next to the pointer (section name, state and source inspection), a click (not a drag) picks it,
 * a click on anything else clears the selection. The canvas is
 * decorative for assistive technology: the zone list of the page is the accessible path.
 */
export default function LienzoCasco({
  nombreBuque,
  dimensiones,
  arquetipo,
  estados,
  fotosPorZona,
  nombresZona,
  inspeccionesZona,
  cargando,
  seleccionada,
  onSeleccionar,
}: PropsLienzoCasco) {
  const reducido = useMovimientoReducido()
  const colores = useColoresTema()
  const casco = useMemo(() => generarCasco(dimensiones, arquetipo), [dimensiones, arquetipo])
  const piezas = useMemo(() => piezasDeEscena(casco, dimensiones.eslora), [casco, dimensiones.eslora])
  useEffect(() => () => liberar(piezas), [piezas])

  const [encima, setEncima] = useState<CodigoZona | null>(null)
  const [flotacion, setFlotacion] = useState(false)
  // The hover label follows the pointer through its style, so moving it never re-renders the scene.
  const etiqueta = useRef<HTMLDivElement>(null)
  // Last pointer position, so a label that appears starts where the pointer already is.
  const puntero = useRef('0px 0px')
  const seguirPuntero = (evento: EventoPunteroReact<HTMLDivElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect()
    puntero.current = `${evento.clientX - caja.left}px ${evento.clientY - caja.top}px`
    etiqueta.current?.style.setProperty('translate', puntero.current)
  }
  const estadoEncima = encima ? estados.get(encima) : undefined
  const mando = useRef<MandoCamara>(null)
  // The canvas camera starts where the fly-in begins: the silhouette's side view, framed for the
  // 16:9 slot (or directly at 3/4 when nothing may move). Kept stable so R3F never resets it.
  const [camara] = useState(() => ({
    fov: CAMPO_VISION_GRADOS,
    near: dimensiones.eslora / 200,
    far: dimensiones.eslora * 20,
    position: tupla(
      posicionDeVista(
        reducido ? '3/4' : 'lateral',
        distanciaDeEncuadre(casco.caja, CAMPO_VISION_GRADOS, ASPECTO_POR_DEFECTO),
      ),
    ),
  }))

  const centro = centroDeCaja(casco.caja)
  const limites = limitesDeDistancia(dimensiones.eslora)
  const sinFotos = colores.get('--c-zona-sin-fotos') ?? GRIS_RESPALDO
  const neutro = mezclarColores(colores.get('--c-surface') ?? '', colores.get('--c-ink') ?? '', MEZCLA_NEUTRA) ?? sinFotos
  const acento = colores.get('--c-accent') ?? ACENTO_RESPALDO
  const duracionColor = duracionMovimiento(DURACION_COLOR_MS, reducido)

  // Clearing an empty selection would only rewrite the URL.
  const elegir = (codigo: CodigoZona | null) => {
    if (codigo !== null || seleccionada !== null) onSeleccionar(codigo)
  }
  const eventosDeZona = (codigo: CodigoZona): EventosMalla => ({
    onPointerOver: (evento) => {
      evento.stopPropagation()
      setEncima(codigo)
    },
    onPointerOut: () => setEncima((actual) => (actual === codigo ? null : actual)),
    onClick: (evento) => {
      evento.stopPropagation()
      if (!esArrastre(evento.delta)) elegir(codigo)
    },
  })
  // Not zones, but solid: they hide what is behind them from the pointer, and a click on them
  // clears the selection like a click on empty space.
  const eventosInertes: EventosMalla = {
    onPointerOver: (evento) => evento.stopPropagation(),
    onClick: (evento) => {
      evento.stopPropagation()
      if (!esArrastre(evento.delta)) elegir(null)
    },
  }

  return (
    <div className="relative isolate size-full">
      <div
        role="img"
        aria-label={`Modelo 3D del casco de ${nombreBuque}`}
        className="absolute inset-0"
        style={{ cursor: encima ? 'pointer' : 'grab' }}
        onPointerMove={seguirPuntero}
      >
        <Canvas
          aria-hidden="true"
          frameloop="demand"
          flat
          dpr={[1, 2]}
          camera={camara}
          onPointerMissed={(evento) => {
            if (evento.type === 'click') elegir(null)
          }}
        >
          <ambientLight intensity={1.7} />
          <directionalLight position={[0.5, 1, 0.7]} intensity={1.9} />
          <directionalLight position={[-0.6, 0.4, -0.8]} intensity={0.6} />

          <group position={[-centro[0], -centro[1], -centro[2]]}>
            {piezas.zonas.map(({ codigo, geometria }) => {
              const variable = variableDeZona(codigo, estados, cargando)
              // A code without a section of the vessel is drawn like the deck and cannot be picked.
              if (variable === null) {
                return (
                  <MallaCasco
                    key={codigo}
                    geometria={geometria}
                    color={neutro}
                    colorInicial={neutro}
                    duracionColor={duracionColor}
                    eventos={eventosInertes}
                  />
                )
              }
              return (
                <MallaCasco
                  key={codigo}
                  geometria={geometria}
                  color={colores.get(variable) ?? sinFotos}
                  colorInicial={sinFotos}
                  duracionColor={duracionColor}
                  resaltada={encima === codigo}
                  contorno={seleccionada === codigo ? acento : null}
                  divisor={colorDivisor(colores.get(variable) ?? sinFotos, colores.get('--c-ink') ?? TINTA_RESPALDO)}
                  eventos={eventosDeZona(codigo)}
                />
              )
            })}
            {piezas.inertes.map((geometria, i) => (
              <MallaCasco
                key={i}
                geometria={geometria}
                color={neutro}
                colorInicial={neutro}
                duracionColor={duracionColor}
                eventos={eventosInertes}
              />
            ))}

            {flotacion && (
              <PlanoFlotacion
                eslora={dimensiones.eslora}
                manga={dimensiones.manga}
                calado={dimensiones.calado}
                color={colores.get('--c-info') ?? acento}
              />
            )}

            {!cargando &&
              piezas.zonas.map(({ codigo, insignia }) => {
                const cantidad = fotosPorZona.get(codigo) ?? 0
                if (cantidad <= 0 || !insignia) return null
                return (
                  <InsigniaFotos key={codigo} punto={insignia.punto} normal={insignia.normal} centro={centro} cantidad={cantidad} />
                )
              })}
          </group>

          <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={limites.min} maxDistance={limites.max} />
          <Camara ref={mando} caja={casco.caja} reducido={reducido} />
        </Canvas>
      </div>

      {encima && (
        // The outer box sits on the pointer; the inner one floats up and to the right of it.
        <div
          ref={(nodo) => {
            etiqueta.current = nodo
            // Starts where the pointer already is; later moves update it through `seguirPuntero`.
            nodo?.style.setProperty('translate', puntero.current)
          }}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-20 select-none"
        >
          <div className="-mt-3 ml-4 -translate-y-full rounded border border-line bg-surface/95 px-2.5 py-1.5 shadow-md">
            <p className="font-mono text-[10px] tracking-wider text-ink-dim uppercase">{encima}</p>
            <p className="text-sm font-semibold whitespace-nowrap text-ink">{nombresZona.get(encima) ?? encima}</p>
            {estadoEncima && !cargando && (
              <p className="text-xs text-ink-muted">{PRESENTACION_ESTADO_ZONA[estadoEncima].texto}</p>
            )}
            {!cargando && inspeccionesZona.has(encima) && (
              <p className="text-xs whitespace-nowrap text-ink-dim">{inspeccionesZona.get(encima)}</p>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2">
        <div role="group" aria-label="Vista de la cámara" className="pointer-events-auto flex flex-wrap gap-1">
          {VISTAS_CAMARA.map(({ vista, texto }) => (
            <button key={vista} type="button" className={CLASES_CONTROL} onClick={() => mando.current?.irA(vista)}>
              {texto}
            </button>
          ))}
        </div>
        <label className={`pointer-events-auto flex cursor-pointer items-center gap-1.5 ${CLASES_CONTROL}`}>
          <input
            type="checkbox"
            checked={flotacion}
            onChange={(evento) => setFlotacion(evento.target.checked)}
            className="accent-accent"
          />
          Mostrar flotación
        </label>
      </div>
    </div>
  )
}

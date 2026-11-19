// Lazy chunk: with `LienzoCasco`, the only modules that import three.js (see `MiniaturaCasco`).
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import type { Arquetipo } from '../../domain/casco/arquetipo'
import { dimensionesCasco } from '../../domain/casco/dimensiones'
import { generarCasco } from '../../domain/casco/geometria'
import { mezclarColores, useColoresTema } from '../../../inspecciones/ui/casco/coloresZona'
import { geometriaDe } from '../../../inspecciones/ui/casco/geometriaThree'
import {
  CAMPO_VISION_GRADOS,
  centroDeCaja,
  distanciaDeEncuadre,
  posicionDeVista,
  useMovimientoReducido,
} from '../../../inspecciones/ui/casco/vistaCasco'

/** A slow turn: one revolution about every 20 seconds. */
const VELOCIDAD_GIRO_RAD_S = (2 * Math.PI) / 20
/** Coarse mesh: a thumbnail does not need the full resolution. */
const RESOLUCION = { cuadernas: 60, filas: 41 }
const ASPECTO = 4 / 3
/** Share of ink in the neutral hull colour (the rest is the card surface). */
const MEZCLA_NEUTRA = 0.45

function Casco({ arquetipo, color, girar }: { arquetipo: Arquetipo; color: string; girar: boolean }) {
  const giro = useRef<Group>(null)
  const { geometrias, centro } = useMemo(() => {
    const casco = generarCasco(dimensionesCasco({}, arquetipo), arquetipo, RESOLUCION)
    const mallas = [...casco.zonas, ...casco.neutras, ...casco.decorativas].filter((m) => m.indices.length > 0)
    return { geometrias: mallas.map(geometriaDe), centro: centroDeCaja(casco.caja) }
  }, [arquetipo])
  useEffect(() => () => geometrias.forEach((g) => g.dispose()), [geometrias])

  useFrame((_, delta) => {
    if (girar && giro.current) giro.current.rotation.y += delta * VELOCIDAD_GIRO_RAD_S
  })

  return (
    <group ref={giro}>
      <group position={[-centro[0], -centro[1], -centro[2]]}>
        {geometrias.map((geometria, i) => (
          <mesh key={i} geometry={geometria}>
            <meshStandardMaterial color={color} roughness={0.8} metalness={0} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Small turning hull of an archetype, at its default proportions. Decorative (aria-hidden). */
export default function LienzoMiniatura({ arquetipo, seleccionado }: { arquetipo: Arquetipo; seleccionado: boolean }) {
  const reducido = useMovimientoReducido()
  const colores = useColoresTema()
  const neutro = mezclarColores(colores.get('--c-surface') ?? '', colores.get('--c-ink') ?? '', MEZCLA_NEUTRA) ?? '#8a94a6'
  const color = seleccionado ? (colores.get('--c-accent') ?? neutro) : neutro
  // Framed from the side so the hull fits at every angle of the turn; fixed once, like the big canvas.
  const [camara] = useState(() => {
    const casco = generarCasco(dimensionesCasco({}, arquetipo), arquetipo, { cuadernas: 12, filas: 21 })
    const distancia = distanciaDeEncuadre(casco.caja, CAMPO_VISION_GRADOS, ASPECTO)
    const [x, y, z] = posicionDeVista('3/4', distancia)
    return { fov: CAMPO_VISION_GRADOS, near: distancia / 50, far: distancia * 10, position: [x, y, z] as [number, number, number] }
  })

  return (
    <Canvas aria-hidden="true" flat dpr={[1, 2]} camera={camara} frameloop={reducido ? 'demand' : 'always'}>
      <ambientLight intensity={1.7} />
      <directionalLight position={[0.5, 1, 0.7]} intensity={1.9} />
      <directionalLight position={[-0.6, 0.4, -0.8]} intensity={0.6} />
      <Casco arquetipo={arquetipo} color={color} girar={!reducido} />
    </Canvas>
  )
}

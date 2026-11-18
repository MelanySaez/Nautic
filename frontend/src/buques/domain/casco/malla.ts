/**
 * Plain indexed triangle meshes and the small builder the hull generator uses. No three.js: the
 * arrays map one to one onto `BufferGeometry` attributes (position, normal, index).
 */

export type Vec3 = readonly [number, number, number]

/** Indexed triangle mesh. Triangles wind counter-clockwise seen from outside (along the normals). */
export interface Malla {
  /** x, y, z per vertex. */
  posiciones: Float32Array
  /** Unit normal per vertex. */
  normales: Float32Array
  /** Three vertex indices per triangle. */
  indices: Uint32Array
}

export const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const escala = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const punto = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cruz = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Unit vector along `a`, or `respaldo` when `a` is (nearly) zero. */
export function normalizar(a: Vec3, respaldo: Vec3 = [0, 0, 1]): Vec3 {
  const largo = Math.hypot(a[0], a[1], a[2])
  return largo < 1e-12 ? respaldo : escala(a, 1 / largo)
}

export interface ConstructorMalla {
  /** Adds a vertex and returns its index. */
  vertice(posicion: Vec3, normal: Vec3): number
  /** Adds a triangle as given. */
  triangulo(a: number, b: number, c: number): void
  /** Adds a triangle wound so that its face points along `haciaFuera`. */
  trianguloHacia(a: number, b: number, c: number, haciaFuera: Vec3): void
  construir(): Malla
}

export function nuevaMalla(): ConstructorMalla {
  const posiciones: number[] = []
  const normales: number[] = []
  const indices: number[] = []
  const leer = (i: number): Vec3 => [posiciones[3 * i], posiciones[3 * i + 1], posiciones[3 * i + 2]]
  return {
    vertice(posicion, normal) {
      posiciones.push(posicion[0], posicion[1], posicion[2])
      normales.push(normal[0], normal[1], normal[2])
      return posiciones.length / 3 - 1
    },
    triangulo(a, b, c) {
      indices.push(a, b, c)
    },
    trianguloHacia(a, b, c, haciaFuera) {
      const pa = leer(a)
      const cara = cruz(resta(leer(b), pa), resta(leer(c), pa))
      if (punto(cara, haciaFuera) < 0) indices.push(a, c, b)
      else indices.push(a, b, c)
    },
    construir() {
      return {
        posiciones: new Float32Array(posiciones),
        normales: new Float32Array(normales),
        indices: new Uint32Array(indices),
      }
    },
  }
}

/** Mirror image across the centreline plane (z → −z), with the winding flipped to stay outward. */
export function reflejarZ(malla: Malla): Malla {
  const posiciones = malla.posiciones.slice()
  const normales = malla.normales.slice()
  for (let k = 2; k < posiciones.length; k += 3) {
    posiciones[k] = -posiciones[k]
    normales[k] = -normales[k]
  }
  const indices = malla.indices.slice()
  for (let k = 0; k < indices.length; k += 3) {
    indices[k + 1] = malla.indices[k + 2]
    indices[k + 2] = malla.indices[k + 1]
  }
  return { posiciones, normales, indices }
}

/** One mesh holding all the given meshes. */
export function unirMallas(mallas: readonly Malla[]): Malla {
  let vertices = 0
  let triangulos = 0
  for (const m of mallas) {
    vertices += m.posiciones.length
    triangulos += m.indices.length
  }
  const posiciones = new Float32Array(vertices)
  const normales = new Float32Array(vertices)
  const indices = new Uint32Array(triangulos)
  let v = 0
  let t = 0
  for (const m of mallas) {
    posiciones.set(m.posiciones, v)
    normales.set(m.normales, v)
    const base = v / 3
    for (let k = 0; k < m.indices.length; k++) indices[t + k] = m.indices[k] + base
    v += m.posiciones.length
    t += m.indices.length
  }
  return { posiciones, normales, indices }
}

/** Flat quad with corners in order around its edge; it faces along `normal`. */
function agregarCara(c: ConstructorMalla, esquinas: readonly Vec3[], normal: Vec3): void {
  const [a, b, d, e] = esquinas.map((p) => c.vertice(p, normal))
  c.trianguloHacia(a, b, d, normal)
  c.trianguloHacia(a, d, e, normal)
}

/**
 * Box centred at `centro`; `u`, `v` and `w` are its three perpendicular half-extent vectors, so
 * the box may be oriented in any direction. Flat-shaded: four vertices per face.
 */
export function agregarCaja(c: ConstructorMalla, centro: Vec3, u: Vec3, v: Vec3, w: Vec3): void {
  for (const [eje, a, b] of [
    [u, v, w],
    [v, w, u],
    [w, u, v],
  ] as const) {
    for (const signo of [1, -1]) {
      const cara = suma(centro, escala(eje, signo))
      agregarCara(
        c,
        [
          resta(resta(cara, a), b),
          resta(suma(cara, a), b),
          suma(suma(cara, a), b),
          suma(resta(cara, a), b),
        ],
        normalizar(escala(eje, signo)),
      )
    }
  }
}

/**
 * Closed, possibly tapered cylinder from `base` along `eje` (its full length vector), with smooth
 * sides and flat caps.
 */
export function agregarCilindro(
  c: ConstructorMalla,
  base: Vec3,
  eje: Vec3,
  radioBase: number,
  radioTope: number,
  segmentos = 20,
): void {
  const direccion = normalizar(eje)
  const largo = Math.hypot(eje[0], eje[1], eje[2])
  const ayuda: Vec3 = Math.abs(direccion[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const e1 = normalizar(cruz(direccion, ayuda))
  const e2 = cruz(direccion, e1)
  const tope = suma(base, eje)
  const pendiente = largo > 0 ? (radioBase - radioTope) / largo : 0
  const radial = (k: number): Vec3 => {
    const angulo = (2 * Math.PI * k) / segmentos
    return suma(escala(e1, Math.cos(angulo)), escala(e2, Math.sin(angulo)))
  }

  const abajo: number[] = []
  const arriba: number[] = []
  for (let k = 0; k <= segmentos; k++) {
    const r = radial(k)
    const normal = normalizar(suma(r, escala(direccion, pendiente)))
    abajo.push(c.vertice(suma(base, escala(r, radioBase)), normal))
    arriba.push(c.vertice(suma(tope, escala(r, radioTope)), normal))
  }
  for (let k = 0; k < segmentos; k++) {
    const fuera = radial(k + 0.5)
    c.trianguloHacia(abajo[k], abajo[k + 1], arriba[k + 1], fuera)
    c.trianguloHacia(abajo[k], arriba[k + 1], arriba[k], fuera)
  }

  for (const [centro, radio, normal] of [
    [base, radioBase, escala(direccion, -1)],
    [tope, radioTope, direccion],
  ] as const) {
    if (radio <= 0) continue
    const medio = c.vertice(centro, normal)
    const anillo = Array.from({ length: segmentos + 1 }, (_, k) =>
      c.vertice(suma(centro, escala(radial(k), radio)), normal),
    )
    for (let k = 0; k < segmentos; k++) c.trianguloHacia(medio, anillo[k], anillo[k + 1], normal)
  }
}

/** Axis-aligned bounding box of the given meshes (zeros when they are empty). */
export function cajaDe(mallas: readonly Malla[]): {
  min: [number, number, number]
  max: [number, number, number]
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of mallas) {
    for (let k = 0; k < m.posiciones.length; k++) {
      const e = k % 3
      const valor = m.posiciones[k]
      if (valor < min[e]) min[e] = valor
      if (valor > max[e]) max[e] = valor
    }
  }
  if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] }
  return { min, max }
}

import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Icon } from '../../shared/ui/Icon'
import { CLAVE_ERROR_SECCIONES, claveErrorFila, type ErroresSecciones, type FilaSeccion, type ModoSecciones } from './filasSeccion'

/** "Secciones del casco" block of the create form: standard sections or an editable custom list. */
export function SeccionesCascoForm({
  modo,
  alCambiarModo,
  filas,
  errores,
  alCambiarFila,
  alAgregar,
  alQuitar,
  alMover,
}: {
  modo: ModoSecciones
  alCambiarModo: (modo: ModoSecciones) => void
  filas: FilaSeccion[]
  errores: ErroresSecciones
  alCambiarFila: (uid: number, campo: 'nombre' | 'codigo' | 'descripcion', valor: string) => void
  alAgregar: () => void
  alQuitar: (uid: number) => void
  /** `delta` is -1 to move a row up and +1 to move it down. */
  alMover: (uid: number, delta: -1 | 1) => void
}) {
  const errorBloque = errores[CLAVE_ERROR_SECCIONES]

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <legend className="label-caps px-2 text-ink-muted">Secciones del casco</legend>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="radio"
            name="modo-secciones"
            checked={modo === 'estandar'}
            onChange={() => alCambiarModo('estandar')}
          />
          Usar las secciones estándar
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="radio"
            name="modo-secciones"
            checked={modo === 'propias'}
            onChange={() => alCambiarModo('propias')}
          />
          Declarar secciones propias
        </label>
      </div>

      {modo === 'estandar' ? (
        <p className="text-sm text-ink-dim">Se crean las 20 zonas estándar del casco.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4">
            {filas.map((fila, indice) => {
              const numero = indice + 1
              return (
                <li key={fila.uid} className="flex flex-col gap-3 rounded border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="label-caps text-ink-dim">Sección {numero}</span>
                    <div className="flex gap-1">
                      <Boton
                        variante="fantasma"
                        aria-label={`Subir sección ${numero}`}
                        disabled={indice === 0}
                        onClick={() => alMover(fila.uid, -1)}>
                        ↑
                      </Boton>
                      <Boton
                        variante="fantasma"
                        aria-label={`Bajar sección ${numero}`}
                        disabled={indice === filas.length - 1}
                        onClick={() => alMover(fila.uid, 1)}>
                        ↓
                      </Boton>
                      <Boton
                        variante="fantasma"
                        aria-label={`Quitar sección ${numero}`}
                        disabled={filas.length === 1}
                        onClick={() => alQuitar(fila.uid)}>
                        <Icon name="trash" className="size-4" />
                      </Boton>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta={`Nombre de la sección ${numero}`} error={errores[claveErrorFila(fila.uid)]}>
                      <input
                        value={fila.nombre}
                        onChange={(e) => alCambiarFila(fila.uid, 'nombre', e.target.value)}
                        maxLength={100}
                        className={CLASES_CONTROL}
                      />
                    </Campo>
                    <Campo etiqueta={`Código de la sección ${numero}`} ayuda="Opcional; se genera si lo dejas vacío.">
                      <input
                        value={fila.codigo}
                        onChange={(e) => alCambiarFila(fila.uid, 'codigo', e.target.value)}
                        maxLength={20}
                        className={CLASES_CONTROL}
                      />
                    </Campo>
                  </div>
                  <Campo etiqueta={`Descripción de la sección ${numero}`}>
                    <input
                      value={fila.descripcion}
                      onChange={(e) => alCambiarFila(fila.uid, 'descripcion', e.target.value)}
                      className={CLASES_CONTROL}
                    />
                  </Campo>
                </li>
              )
            })}
          </ol>
          <Boton variante="secundario" onClick={alAgregar} className="self-start">
            <Icon name="plus" className="size-4" />
            Agregar sección
          </Boton>
        </div>
      )}

      {errorBloque && <p className="text-sm text-critical">{errorBloque}</p>}
    </fieldset>
  )
}

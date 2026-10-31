import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { Boton, EnlaceBoton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { mensajeDe } from '../../shared/ui/formato'

export function NuevaInspeccionPage() {
  const { buques, inspecciones } = useDependencias()
  const navegar = useNavigate()
  const cargarBuques = useCallback(() => buques.listar(), [buques])
  const { estado: flota } = useRecurso(cargarBuques)

  const [buqueId, setBuqueId] = useState('')
  const [nombre, setNombre] = useState('')
  const [tomadoPor, setTomadoPor] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [errorBuque, setErrorBuque] = useState<string | null>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!buqueId) {
      setErrorBuque('Selecciona un buque.')
      return
    }
    setErrorEnvio(null)
    setEnviando(true)
    try {
      const creada = await inspecciones.crear({
        buqueId: Number(buqueId),
        nombre: nombre.trim(),
        tomadoPor: tomadoPor.trim(),
        descripcion: descripcion.trim(),
      })
      navegar(`/vision/${creada.id}`)
    } catch (error) {
      setErrorEnvio(mensajeDe(error))
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link to="/" aria-label="Volver al listado" className="rounded p-1 text-ink-muted hover:text-ink">
          <Icon name="back" className="size-6" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold tracking-tight md:text-3xl">Nueva inspección</h1>
        <span className="label-caps text-ink-dim">Borrador</span>
      </header>

      {flota.tipo === 'error' && <MensajeError mensaje={flota.mensaje} />}

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Tarjeta titulo="Parámetros de la misión">
          <div className="flex flex-col gap-5">
            <Campo etiqueta="Buque" error={errorBuque}>
              <select
                value={buqueId}
                onChange={(e) => {
                  setBuqueId(e.target.value)
                  setErrorBuque(null)
                }}
                disabled={flota.tipo !== 'listo'}
                className={CLASES_CONTROL}
              >
                <option value="">{flota.tipo === 'cargando' ? 'Cargando flota…' : 'Selecciona un buque de la flota…'}</option>
                {flota.tipo === 'listo' &&
                  flota.datos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} · {b.tipo}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo etiqueta="Nombre (opcional)" ayuda="Si lo dejas vacío se genera uno con el número y el buque.">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Por ejemplo: Control anual 2026"
                maxLength={255}
                className={CLASES_CONTROL}
              />
            </Campo>
            <Campo etiqueta="Inspector">
              <input
                value={tomadoPor}
                onChange={(e) => setTomadoPor(e.target.value)}
                placeholder="Nombre y apellido"
                maxLength={255}
                autoComplete="name"
                className={CLASES_CONTROL}
              />
            </Campo>
            <Campo etiqueta="Descripción">
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={4}
                placeholder="Propósito o zona de interés (por ejemplo: control rutinario de casco, evaluación de impacto en proa…)"
                className={`${CLASES_CONTROL} resize-y`}
              />
            </Campo>
          </div>
        </Tarjeta>

        {errorEnvio && <MensajeError mensaje={errorEnvio} />}

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row-reverse">
          <Boton type="submit" disabled={enviando} className="sm:min-w-56">
            <Icon name="play" className="size-4" />
            {enviando ? 'Creando…' : 'Iniciar inspección'}
          </Boton>
          <EnlaceBoton to="/" variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      </form>
    </div>
  )
}

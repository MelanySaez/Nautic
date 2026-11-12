import { Navigate, useParams } from 'react-router'

/** Keeps bookmarks of the former upload path (`/inspecciones/:id/carga`) working. */
export function RedirigirACarga() {
  const { id } = useParams()
  return <Navigate to={`/vision/${id}`} replace />
}

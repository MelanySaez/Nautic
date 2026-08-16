//export const API_BASE = 'http://10.230.0.33:8000';
export const API_BASE = 'http://localhost:8000';
//export const API_BASE = 'http://192.168.93.79:8000';


// Las constantes de rol y buque ahora provienen dinámicamente del AuthContext (/auth/me)
// Importa useAuth() desde context/AuthContext para acceder a: user.role, user.buque_id, user.buque_nombre

import { ShieldCheck, Clock } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { useLogin } from './hooks/useLogin';
import Footer from '../../components/Footer';

export default function Login() {
  const {
    error, setError,
    mensajeExpiracion,
    handleGoogleSuccess
  } = useLogin();

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Franja superior institucional (Gobierno de Chile) */}
      <div className="w-full h-2 flex shrink-0">
        <div className="w-1/2 bg-blue-900"></div>
        <div className="w-1/2 bg-red-600"></div>
      </div>

      {/* Zona de acceso (centrada, ocupa el espacio disponible) */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
        
      <div className="bg-blue-950 p-8 text-center border-b-4 border-red-600">
          <div className="flex flex-col items-center justify-center my-2">
              <img 
                src="/images/logo_slep.png"
                alt="Logo SLEP Valparaíso" 
                className="max-h-20 w-auto object-contain" 
              /> 
          </div>          
          
          <p className="text-white mt-4 text-2xl font-bold">RGM 2027</p>
          <p className="text-blue-100 text-sm font-medium mt-0.5">Registro General de Matrículas</p>
        </div>

        <div className="p-8">
          {mensajeExpiracion && (
            <div className="bg-amber-50 text-amber-900 p-3.5 rounded-lg text-sm mb-6 font-medium border border-amber-300 flex items-start gap-2.5 shadow-sm">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">Sesión Finalizada</p>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{mensajeExpiracion}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm mb-6 text-center font-bold border border-red-200 flex items-center justify-center gap-2">
              <ShieldCheck size={18} /> {error}
            </div>
          )}

          <div className="text-center mb-6">
            <p className="text-sm text-gray-600 font-medium">
              Inicie sesión con su cuenta institucional
            </p>
            <p className="text-xs text-gray-400 mt-1">
              El sistema reconoce su perfil automáticamente según su correo.
            </p>
          </div>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('El inicio de sesión con Google fue cancelado o falló.')}
              useOneTap
              theme="filled_blue"
              text="signin_with"
              shape="rectangular"
            />
          </div>
        </div>
      </div>
      
        <p className="mt-8 text-xs text-gray-500 font-medium">
          © {new Date().getFullYear()} Servicio Local de Educación Pública Valparaíso. Todos los derechos reservados.
        </p>
      </div>

      {/* Footer institucional */}
      <Footer />
    </div>
  );
}
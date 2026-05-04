import React from 'react';
import { Link } from 'react-router-dom';
import zypaceLogo from '../assets/zypace_solo_logo.png';
import poweredByStrava from '../assets/1.2-Strava-API-Logos/Powered by Strava/pwrdBy_strava_black/api_logo_pwrdBy_strava_horiz_black.svg';

const year = new Date().getFullYear();

const AppFooter: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white/90 backdrop-blur-sm text-gray-600 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 grid gap-10 md:grid-cols-4">
        <div className="space-y-3">
          <img src={zypaceLogo} alt="Zypace" className="h-8 w-auto" />
          <p className="text-xs leading-relaxed text-gray-600">Plataforma para planificar, seguir y optimizar tu entrenamiento con datos y generación inteligente de planes.</p>
          <p className="text-[10px] text-gray-400">© {year} Zypace. Todos los derechos reservados.</p>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Producto</h4>
          <ul className="space-y-2 text-xs">
            <li><Link to="/app" className="hover:text-lime-600 transition-colors">Dashboard</Link></li>
            <li><Link to="/races" className="hover:text-lime-600 transition-colors">Carreras</Link></li>
            <li><Link to="/training-plan" className="hover:text-lime-600 transition-colors">Plan</Link></li>
            <li><Link to="/settings" className="hover:text-lime-600 transition-colors">Ajustes</Link></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Recursos</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="#" className="hover:text-lime-600 transition-colors">Guía rápida</a></li>
            <li><a href="#" className="hover:text-lime-600 transition-colors">FAQ</a></li>
            <li><a href="#" className="hover:text-lime-600 transition-colors">Changelog</a></li>
            <li><a href="#" className="hover:text-lime-600 transition-colors">Estado</a></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Legal</h4>
          <ul className="space-y-2 text-xs">
            <li><Link to="/terms" className="hover:text-lime-600 transition-colors">Términos</Link></li>
            <li><Link to="/privacy" className="hover:text-lime-600 transition-colors">Privacidad</Link></li>
            <li><Link to="/security" className="hover:text-lime-600 transition-colors">Seguridad</Link></li>
            <li><Link to="/cookies" className="hover:text-lime-600 transition-colors">Cookies</Link></li>
            <li><a href="mailto:contact@zypace.com" className="hover:text-lime-600 transition-colors">Contacto</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-100 bg-white/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">Hecho con <span className="text-lime-500">❤</span> para runners.</p>
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <a href="#" className="hover:text-lime-600 transition-colors">Twitter</a>
            <a href="#" className="hover:text-lime-600 transition-colors">GitHub</a>
            <a href="#" className="hover:text-lime-600 transition-colors">Blog</a>
          </div>
          <div className="flex items-center gap-2">
            <img src={poweredByStrava} alt="Powered by Strava" className="h-5 w-auto" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;

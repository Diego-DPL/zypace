import React from 'react';
import { Link } from 'react-router-dom';

const year = new Date().getFullYear();

const AppFooter: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white/90 backdrop-blur-sm text-gray-600 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 grid gap-10 md:grid-cols-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold tracking-wide text-gray-900 uppercase">Zypace</h3>
          <p className="text-xs leading-relaxed text-gray-600">Plataforma para planificar, seguir y optimizar tu entrenamiento con datos y generación inteligente de planes.</p>
          <p className="text-[10px] text-gray-400">© {year} Zypace. Todos los derechos reservados.</p>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Producto</h4>
          <ul className="space-y-2 text-xs">
            <li><Link to="/app" className="hover:text-orange-600">Dashboard</Link></li>
            <li><Link to="/races" className="hover:text-orange-600">Carreras</Link></li>
            <li><Link to="/training-plan" className="hover:text-orange-600">Plan</Link></li>
            <li><Link to="/settings" className="hover:text-orange-600">Ajustes</Link></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Recursos</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="#" className="hover:text-orange-600">Guía rápida</a></li>
            <li><a href="#" className="hover:text-orange-600">FAQ</a></li>
            <li><a href="#" className="hover:text-orange-600">Changelog</a></li>
            <li><a href="#" className="hover:text-orange-600">Estado</a></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Legal</h4>
          <ul className="space-y-2 text-xs">
            <li><Link to="/terms" className="hover:text-orange-600">Términos</Link></li>
            <li><Link to="/privacy" className="hover:text-orange-600">Privacidad</Link></li>
            <li><Link to="/security" className="hover:text-orange-600">Seguridad</Link></li>
            <li><Link to="/cookies" className="hover:text-orange-600">Cookies</Link></li>
            <li><a href="mailto:contact@zypace.com" className="hover:text-orange-600">Contacto</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-100 bg-white/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">Hecho con <span className="text-orange-500">❤</span> para runners.</p>
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <a href="#" className="hover:text-orange-600">Twitter</a>
            <a href="#" className="hover:text-orange-600">GitHub</a>
            <a href="#" className="hover:text-orange-600">Blog</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;

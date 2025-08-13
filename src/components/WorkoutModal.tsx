import React from 'react';

interface WorkoutModalProps {
  open: boolean;
  onClose: () => void;
  workout: any | null; // shape: { description, explanation?, workout_date? }
}

const WorkoutModal: React.FC<WorkoutModalProps> = ({ open, onClose, workout }) => {
  if (!open || !workout) return null;
  const exp = workout.explanation || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Entrenamiento</h3>
        {workout.workout_date && (
          <p className="text-sm text-gray-500 mb-2">Fecha: {new Date(workout.workout_date).toLocaleDateString('es-ES')}</p>
        )}
        <p className="text-gray-800 font-medium mb-4">{workout.description}</p>
        <div className="space-y-3 text-sm">
          {exp.type && <p><span className="font-semibold text-gray-700">Tipo:</span> {exp.type}</p>}
          {exp.purpose && <p><span className="font-semibold text-gray-700">Objetivo:</span> {exp.purpose}</p>}
          {exp.details && <p><span className="font-semibold text-gray-700">Cómo hacerlo:</span> {exp.details}</p>}
          {exp.intensity && <p><span className="font-semibold text-gray-700">Intensidad sugerida:</span> {exp.intensity}</p>}
        </div>
        <div className="mt-6 text-right">
          <button onClick={onClose} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-semibold">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutModal;

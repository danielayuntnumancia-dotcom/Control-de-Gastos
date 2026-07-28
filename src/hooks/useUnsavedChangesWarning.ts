import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChangesWarning(isDirty: boolean) {
  // Warn when user tries to reload/close the tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Block in-app navigation
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirmLeave = window.confirm(
        'Tienes cambios sin guardar. ¿Seguro que quieres salir y descartarlos?'
      );
      if (confirmLeave) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);
}

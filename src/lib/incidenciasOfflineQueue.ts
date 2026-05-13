const QUEUE_KEY = 'incidencias_offline_queue';

export interface OfflineIncidencia {
  id: string;
  departmentId: string;
  categoryId: string;
  workerIds: string[];
  fecha: string;
  descripcion: string;
  accionPropuesta: string;
  propuestaSuspension: boolean;
  propuestaFechaInicio: string | null;
  createdAt: string;
}

export function getOfflineQueue(): OfflineIncidencia[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToOfflineQueue(item: Omit<OfflineIncidencia, 'id' | 'createdAt'>): void {
  const queue = getOfflineQueue();
  queue.push({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue().filter(i => i.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineCount(): number {
  return getOfflineQueue().length;
}

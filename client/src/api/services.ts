const BASE = "/api/servicos";

export interface ServiceItem {
  id: string;
  name: string;
  rollSizes: string[];
  notes: string;
  completed: boolean;
  completionNote: string;
  attachments: string[];
  completionAttachments: string[];
  itemOrder: number;
  serviceOrderId: string;
}

export interface ServiceLog {
  id: string;
  action: string;
  summary: string;
  actor: { id: string; name: string };
  details: Record<string, unknown>;
  createdAt: string;
  serviceOrderId: string | null;
}

export interface ServiceOrder {
  id: string;
  serviceNumber: number;
  name: string;
  type: string;
  orderDate: string;
  seller: string;
  requester: string;
  clientPhone: string | null;
  status: "open" | "development" | "done" | "deleted";
  queuePosition: number | null;
  completedAt: string | null;
  completionMessage: string | null;
  deletedReason: string | null;
  deletedAt: string | null;
  developerUserId: string | null;
  developerUser: { id: string; name: string; avatarUrl: string | null } | null;
  createdByUserId: string;
  createdByUser: { id: string; name: string; avatarUrl: string | null } | null;
  createdAt: string;
  updatedAt: string;
  items: ServiceItem[];
  logs?: ServiceLog[];
}

export interface CreateServiceInput {
  name: string;
  type: string;
  orderDate: string;
  seller: string;
  requester: string;
  clientPhone?: string;
  items: Array<{ name: string; rollSizes: string[]; notes: string }>;
}

export interface UpdateServiceInput {
  name?: string;
  type?: string;
  orderDate?: string;
  seller?: string;
  requester?: string;
  clientPhone?: string;
  items?: Array<{ name: string; rollSizes: string[]; notes: string }>;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function json(method: string, body: unknown, extra?: RequestInit) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...extra,
  };
}

export const servicesApi = {
  list: (status?: string) =>
    request<ServiceOrder[]>(`${BASE}${status ? `?status=${status}` : ""}`),

  logs: () => request<ServiceLog[]>(`${BASE}/logs`),

  create: (input: CreateServiceInput) =>
    request<ServiceOrder>(BASE, json("POST", input)),

  update: (id: string, input: UpdateServiceInput) =>
    request<ServiceOrder>(`${BASE}/${id}`, json("PUT", input)),

  changeStatus: (
    id: string,
    payload: {
      newStatus: string;
      developerUserId?: string;
      completionMessage?: string;
      itemCompletions?: Array<{ id: string; completed: boolean; completionNote: string }>;
      deletedReason?: string;
    }
  ) => request<ServiceOrder>(`${BASE}/${id}/status`, json("PUT", payload)),

  reorderQueue: (orderedIds: string[]) =>
    request<void>(`${BASE}/fila`, json("PUT", { orderedIds })),

  uploadAttachment: (
    id: string,
    payload: { itemId?: string; fileName: string; dataUrl: string; type: "service" | "completion" }
  ) => request<{ url: string }>(`${BASE}/${id}/attachment`, json("POST", payload)),

  deleteAttachment: (
    id: string,
    payload: { itemId: string; attachmentUrl: string; type: "service" | "completion" }
  ) => request<void>(`${BASE}/${id}/attachment`, json("DELETE", payload)),
};

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

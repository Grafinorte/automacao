export type Role = "ADMIN" | "MEMBER" | "ORCAMENTISTA" | "COMERCIAL" | "MARKETING" | "RH" | "ALMOXARIFADO" | "PCP" | "DESIGN" | "ARTE" | "ARTE_FINAL" | "GERENTE" | "SUPERVISOR" | "CONSULTA";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type IssuingCompany = "GRAFINORTE" | "TRIBUNA_DO_NORTE" | "TN_ONLINE" | "PLUSPACK";

export const ISSUING_COMPANY_LABELS: Record<IssuingCompany, string> = {
  GRAFINORTE: "Grafinorte Indústria Gráfica",
  TRIBUNA_DO_NORTE: "Tribuna do Norte",
  TN_ONLINE: "TN Online",
  PLUSPACK: "Pluspack",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  MEMBER: "Membro",
  ORCAMENTISTA: "Orçamentista",
  COMERCIAL: "Comercial",
  MARKETING: "Marketing",
  RH: "RH",
  ALMOXARIFADO: "Almoxarifado",
  PCP: "PCP",
  DESIGN: "Desenvolvedor",
  ARTE: "Desenvolvimento de Arte",
  ARTE_FINAL: "Arte Final",
  GERENTE: "Gerente",
  SUPERVISOR: "Supervisor",
  CONSULTA: "Consulta",
};

export type StockMovementType = "ENTRADA" | "SAIDA" | "AJUSTE";

export const STOCK_CATEGORIES = ["Papel", "Tinta", "Insumo", "Embalagem", "Outros"] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

export const STOCK_UNITS = ["Resma", "Folha", "Rolo", "Bobina", "Litro", "Kg", "Unidade", "Caixa", "Pacote"] as const;

export interface StockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  location: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: number;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
  item?: { id: string; name: string; unit: string };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string | null;
  avatarUrl: string | null;
  waPhoneNumberId: string | null;
}

export interface AdminUser extends SessionUser {
  isActive: boolean;
  createdAt: string;
}

export interface TaskUserRef {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: Role;
}

export interface TaskAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  uploadedBy: { id: string; name: string };
}

export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
  order: number;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  order: number;
  columnId: string;
  createdAt: string;
  assignee: TaskUserRef | null;
  createdBy: TaskUserRef;
  attachments: TaskAttachment[];
  subtasks: TaskSubtask[];
  members: { user: TaskUserRef }[];
}

export interface Column {
  id: string;
  name: string;
  order: number;
  boardId: string;
  tasks: Task[];
}

export interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  _count: { members: number };
}

export interface Board {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  columns: Column[];
  members: { user: TaskUserRef }[];
}

export interface Product {
  id: string;
  name: string;
  specifications: string;
  unitPrice: number | null;
  active: boolean;
  order: number;
}

export interface QuoteItem {
  id: string;
  productId: string | null;
  productName: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
  order: number;
}

export interface QuoteListItem {
  id: string;
  number: number;
  issuingCompany: IssuingCompany;
  clientName: string;
  clientContact: string | null;
  validUntil: string | null;
  createdAt: string;
  createdBy: TaskUserRef;
  total: number;
}

export interface Quote extends QuoteListItem {
  notes: string | null;
  items: QuoteItem[];
}

export interface CrmStageBase {
  id: string;
  name: string;
  order: number;
  isClosed: boolean;
  isWon: boolean;
}

export interface CrmStage extends CrmStageBase {
  deals: Deal[];
}

export interface Contact {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ContactWithDeals extends Contact {
  deals: (Deal & { stage: CrmStage })[];
}

export interface ProspectCompany {
  nome: string;
  cidade: string;
  telefone: string;
  porte: string;
  redeSocial: string;
  fontes: string;
  confiabilidade: string;
}

export interface ProspectingResult {
  raw: string;
  companies: ProspectCompany[];
}

export interface Deal {
  id: string;
  title: string;
  value: number;
  expectedCloseDate: string | null;
  notes: string | null;
  nextFollowUp: string | null;
  lossReason: string | null;
  order: number;
  stageId: string;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string; company: string | null };
  owner: TaskUserRef;
  quote: { id: string; number: number } | null;
  company: string;
}

export interface DealActivity {
  id: string;
  body: string;
  createdAt: string;
  author: TaskUserRef;
}

export interface DealDetail extends Deal {
  createdBy: TaskUserRef;
  activities: DealActivity[];
}

export type MarketingChannel = "REDES_SOCIAIS" | "EMAIL" | "IMPRESSO" | "SITE" | "OUTRO";
export type CampaignStatus = "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADA" | "CONCLUIDA";
export type ContentStatus = "IDEIA" | "EM_PRODUCAO" | "AGUARDANDO_APROVACAO" | "APROVADO" | "PUBLICADO";

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  REDES_SOCIAIS: "Redes Sociais",
  EMAIL: "E-mail",
  IMPRESSO: "Impresso",
  SITE: "Site",
  OUTRO: "Outro",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  PLANEJAMENTO: "Planejamento",
  EM_ANDAMENTO: "Em andamento",
  PAUSADA: "Pausada",
  CONCLUIDA: "Concluída",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  IDEIA: "Ideia",
  EM_PRODUCAO: "Em produção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  PUBLICADO: "Publicado",
};

export const CONTENT_STATUS_ORDER: ContentStatus[] = [
  "IDEIA",
  "EM_PRODUCAO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "PUBLICADO",
];

export interface Campaign {
  id: string;
  name: string;
  objective: string | null;
  channel: MarketingChannel;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  notes: string | null;
  createdAt: string;
  owner: TaskUserRef;
  _count: { contentItems: number };
}

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  channel: MarketingChannel;
  status: ContentStatus;
  scheduledDate: string | null;
  notes: string | null;
  order: number;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  assignee: TaskUserRef | null;
}

export interface ContentBoardColumn {
  status: ContentStatus;
  items: ContentItem[];
}

export interface CampaignDetail extends Campaign {
  contentItems: ContentItem[];
}

export type EmployeeStatus = "ATIVO" | "AFASTADO" | "DEMITIDO";
export type VacationStatus = "PLANEJADA" | "EM_ANDAMENTO" | "CONCLUIDA";

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ATIVO: "Ativo",
  AFASTADO: "Afastado",
  DEMITIDO: "Desligado",
};

export const VACATION_STATUS_LABELS: Record<VacationStatus, string> = {
  PLANEJADA: "Planejada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

export interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  position: string;
  department: string;
  company: string;
  admissionDate: string;
  terminationDate: string | null;
  status: EmployeeStatus;
  salary: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryChange {
  id: string;
  amount: number;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
  createdBy: TaskUserRef;
}

export interface Vacation {
  id: string;
  startDate: string;
  endDate: string;
  status: VacationStatus;
  notes: string | null;
  createdAt: string;
}

export interface VacationWithEmployee extends Vacation {
  employee: { id: string; name: string; department: string; company: string };
}

export interface EmployeeDocument {
  id: string;
  name: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface EmployeeDetail extends Employee {
  salaryChanges: SalaryChange[];
  vacations: Vacation[];
  documents: EmployeeDocument[];
}

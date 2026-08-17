export interface ModuleDef {
  id: string;
  label: string;
  desc: string;
  icon: string;
  group: string;
}

export const ALL_MODULES: ModuleDef[] = [
  // Geral
  { id: "tarefas",      label: "Tarefas",        desc: "Quadro kanban e gerenciamento de tarefas",         icon: "✅", group: "Geral" },
  { id: "chat",         label: "Chat Interno",    desc: "Mensagens e comunicação interna",                  icon: "💬", group: "Geral" },
  { id: "documentos",   label: "Agente Luma (IA)",desc: "Assistente IA e base de conhecimento",            icon: "🤖", group: "Geral" },
  { id: "producao",     label: "Produção",        desc: "Acompanhamento do processo produtivo",             icon: "🏭", group: "Geral" },
  { id: "financeiro",   label: "Financeiro",      desc: "Relatórios e controle financeiro",                 icon: "💰", group: "Geral" },
  // Comercial
  { id: "comercial",    label: "CRM / Comercial", desc: "Funil de vendas, contatos e negociações",         icon: "📊", group: "Comercial" },
  { id: "whatsapp",     label: "WhatsApp Inbox",  desc: "Inbox WhatsApp, conversas e automações",          icon: "💬", group: "Comercial" },
  { id: "orcamentos",   label: "Orçamentos",      desc: "Criação e consulta de orçamentos",                 icon: "📄", group: "Comercial" },
  { id: "proposta",     label: "Propostas",       desc: "Gerador de propostas comerciais",                  icon: "📋", group: "Comercial" },
  // Departamentos
  { id: "marketing",    label: "Marketing",       desc: "Campanhas e conteúdo de marketing",                icon: "📣", group: "Departamentos" },
  { id: "rh",           label: "RH",              desc: "Funcionários, férias e documentos",                icon: "👥", group: "Departamentos" },
  { id: "almoxarifado", label: "Almoxarifado",    desc: "Controle de estoque e materiais",                  icon: "📦", group: "Departamentos" },
  // Departamentos
  { id: "servicos",     label: "Central de Serviços", desc: "Gerenciamento de serviços e ordens de produção", icon: "🖨️", group: "Departamentos" },
  // Admin (sempre admin-only, não togglável para outros)
  { id: "catalogo",     label: "Catálogo",        desc: "Catálogo de produtos da empresa",                  icon: "📚", group: "Admin" },
];

export const MODULE_GROUPS = ["Geral", "Comercial", "Departamentos", "Admin"] as const;

/** Retorna true se o usuário tem acesso ao módulo, respeitando permissões customizadas */
export function hasModuleAccess(
  userRole: string,
  userPermissions: string | null,
  moduleId: string
): boolean {
  if (userRole === "ADMIN") return true;

  if (userPermissions !== null) {
    try {
      const perms: string[] = JSON.parse(userPermissions);
      return perms.includes(moduleId);
    } catch {
      return false;
    }
  }

  // Fallback: role-based defaults
  const defaults: Record<string, string[]> = {
    MEMBER:        ["tarefas", "chat", "documentos", "producao", "financeiro"],
    ORCAMENTISTA:  ["tarefas", "chat", "documentos", "producao", "financeiro", "orcamentos", "proposta", "comercial"],
    COMERCIAL:     ["tarefas", "chat", "documentos", "producao", "financeiro", "comercial", "whatsapp", "orcamentos", "proposta"],
    MARKETING:     ["tarefas", "chat", "documentos", "producao", "financeiro", "marketing"],
    RH:            ["tarefas", "chat", "documentos", "producao", "financeiro", "rh"],
    ALMOXARIFADO:  ["tarefas", "chat", "documentos", "producao", "financeiro", "almoxarifado"],
    PCP:           ["tarefas", "chat", "documentos", "producao", "financeiro", "servicos"],
    DESIGN:        ["tarefas", "chat", "documentos", "producao", "financeiro", "servicos"],
    GERENTE:       ["tarefas", "chat", "documentos", "producao", "financeiro", "servicos", "comercial", "orcamentos", "rh"],
    SUPERVISOR:    ["tarefas", "chat", "documentos", "producao", "financeiro", "servicos", "comercial", "orcamentos"],
    CONSULTA:      ["servicos"],
  };

  return (defaults[userRole] ?? []).includes(moduleId);
}

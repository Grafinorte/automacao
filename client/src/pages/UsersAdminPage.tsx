import { useEffect, useState, type FormEvent } from "react";
import { usersApi } from "../api/users";
import { ApiError } from "../api/client";
import type { AdminUser, Role } from "../types";
import { ROLE_LABELS } from "../types";
import { ALL_MODULES, MODULE_GROUPS, hasModuleAccess } from "../config/modules";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "MEMBER",       label: "Membro" },
  { value: "ORCAMENTISTA", label: "Orçamentista" },
  { value: "COMERCIAL",    label: "Comercial" },
  { value: "MARKETING",    label: "Marketing" },
  { value: "RH",           label: "RH" },
  { value: "ALMOXARIFADO", label: "Almoxarifado" },
  { value: "PCP",          label: "PCP" },
  { value: "DESIGN",       label: "Desenvolvedor" },
  { value: "GERENTE",      label: "Gerente" },
  { value: "SUPERVISOR",   label: "Supervisor" },
  { value: "CONSULTA",     label: "Consulta" },
  { value: "ADMIN",        label: "Administrador" },
];

const ROLE_COLOR: Record<Role, string> = {
  ADMIN:       "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  MEMBER:      "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-[#a0a0a4]",
  ORCAMENTISTA:"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  COMERCIAL:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  MARKETING:   "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  RH:          "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  ALMOXARIFADO:"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  PCP:         "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  DESIGN:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  GERENTE:     "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  SUPERVISOR:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  CONSULTA:    "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-[#77767b]",
};

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function parsePerms(raw: string | null): string[] | null {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-[#005cba]" : "bg-[#d1d1d6] dark:bg-[#3a3a3e]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* ─── Permissions Panel ─── */
function PermissionsPanel({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isAdmin = user.role === "ADMIN";
  const [useCustom, setUseCustom] = useState(user.permissions !== null);
  const [perms, setPerms] = useState<string[]>(() => {
    const p = parsePerms(user.permissions);
    if (p) return p;
    // default from role
    return ALL_MODULES.filter((m) =>
      hasModuleAccess(user.role, null, m.id) && m.group !== "Admin"
    ).map((m) => m.id);
  });
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    // Auto-enable custom mode on first toggle (instead of silently ignoring)
    if (!useCustom) setUseCustom(true);
    setPerms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function save() {
    setSaving(true);
    await usersApi.update(user.id, { permissions: useCustom ? perms : null });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-20 z-50 flex h-[calc(100vh-80px)] w-full max-w-[420px] flex-col border-l border-[rgba(199,198,202,0.3)] bg-white shadow-2xl dark:bg-[#1c1e22] dark:border-white/8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(199,198,202,0.3)] dark:border-white/8 px-6 py-4">
          <div>
            <h2 className="text-[16px] font-bold text-[#030304] dark:text-[#e0e0e2]">
              Permissões
            </h2>
            <p className="mt-0.5 text-[12px] text-[#77767b]">{user.name}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isAdmin ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/30 text-2xl">
              👑
            </div>
            <p className="font-semibold text-[#030304] dark:text-[#e0e0e2]">Acesso total</p>
            <p className="text-[13px] text-[#77767b]">
              Administradores têm acesso irrestrito a todos os módulos do sistema.
            </p>
          </div>
        ) : (
          <>
            {/* Custom toggle */}
            <div className="border-b border-[rgba(199,198,202,0.3)] dark:border-white/8 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#030304] dark:text-[#e0e0e2]">
                    Permissões personalizadas
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#77767b]">
                    {useCustom
                      ? "Usando lista customizada abaixo"
                      : `Usando padrão do cargo: ${ROLE_LABELS[user.role]}`}
                  </p>
                </div>
                <Toggle checked={useCustom} onChange={() => setUseCustom((v) => !v)} />
              </div>
            </div>

            {/* Modules list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {MODULE_GROUPS.filter((g) => g !== "Admin").map((group) => {
                const mods = ALL_MODULES.filter((m) => m.group === group);
                return (
                  <div key={group} className="mb-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#77767b]">
                      {group}
                    </p>
                    <div className="space-y-1">
                      {mods.map((mod) => {
                        const active = useCustom
                          ? perms.includes(mod.id)
                          : hasModuleAccess(user.role, null, mod.id);
                        return (
                          <div
                            key={mod.id}
                            className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                              active
                                ? "bg-[#005cba]/5 dark:bg-[#60a5fa]/5"
                                : "bg-[#f9f9fb] dark:bg-[#111214]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{mod.icon}</span>
                              <div>
                                <p className={`text-[13px] font-medium ${active ? "text-[#030304] dark:text-[#e0e0e2]" : "text-[#77767b]"}`}>
                                  {mod.label}
                                </p>
                                <p className="text-[10px] text-[#a0a0a4]">{mod.desc}</p>
                              </div>
                            </div>
                            <Toggle
                              checked={active}
                              onChange={() => toggle(mod.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-[rgba(199,198,202,0.3)] dark:border-white/8 px-6 py-4">
              <button
                onClick={save}
                disabled={saving}
                className="w-full rounded-xl bg-[#005cba] py-2.5 text-[13px] font-semibold text-white shadow transition-all hover:bg-[#0047a3] active:scale-95 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar permissões"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ─── Edit Modal ─── */
function EditModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [password, setPassword] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState(user.waPhoneNumberId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const roleChanged = role !== user.role;
      await usersApi.update(user.id, {
        name,
        email,
        role,
        ...(password ? { password } : {}),
        // Clear custom permissions when role changes so new role defaults apply
        ...(roleChanged && user.permissions !== null ? { permissions: null } : {}),
        waPhoneNumberId: waPhoneNumberId.trim() || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1c1e22] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] dark:border-white/8 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Editar usuário</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-6">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Nome</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Cargo base</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Nova senha</label>
            <input
              type="password"
              placeholder="Deixe em branco para não alterar"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">
              <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z"/></svg>
              ID do número WhatsApp
            </label>
            <input
              value={waPhoneNumberId}
              onChange={(e) => setWaPhoneNumberId(e.target.value)}
              placeholder="Ex: 1311728092015168 (deixe vazio para usar o padrão)"
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8 font-mono"
            />
            <p className="mt-1 text-[10px] text-[#77767b]">Phone Number ID da Meta — mensagens deste usuário saem por este número</p>
          </div>
          {role !== user.role && user.permissions !== null && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
              ⚠ As permissões personalizadas serão redefinidas para o padrão do novo cargo.
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#005cba] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#0047a3] disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[rgba(0,0,0,0.1)] px-4 py-2.5 text-[13px] font-medium text-[#46464a] transition hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:border-white/8 dark:hover:bg-[#222426]"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Create Modal ─── */
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await usersApi.create({ name, email, password, role });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o usuário");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1c1e22] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] dark:border-white/8 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Novo usuário</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-6">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Nome</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Senha</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#77767b]">Cargo base</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#030304] outline-none focus:border-[#005cba] dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#005cba] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#0047a3] disabled:opacity-60"
            >
              {saving ? "Criando..." : "Criar usuário"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[rgba(0,0,0,0.1)] px-4 py-2.5 text-[13px] font-medium text-[#46464a] transition hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:border-white/8 dark:hover:bg-[#222426]"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── User Card ─── */
function UserCard({
  user,
  onEdit,
  onPermissions,
  onToggleActive,
}: {
  user: AdminUser;
  onEdit: () => void;
  onPermissions: () => void;
  onToggleActive: () => void;
}) {
  const hasCustomPerms = user.permissions !== null && user.role !== "ADMIN";
  const customCount = hasCustomPerms ? (parsePerms(user.permissions)?.length ?? 0) : 0;

  return (
    <div className={`glass-card smooth-shadow rounded-2xl p-5 transition-all duration-200 ${!user.isActive ? "opacity-60" : ""}`}>
      {/* Top: avatar + info */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#005cba]/10 text-[13px] font-bold text-[#005cba] dark:bg-[#60a5fa]/10 dark:text-[#60a5fa]">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            getInitials(user.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-[#030304] dark:text-[#e0e0e2]">{user.name}</p>
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
          </div>
          <p className="truncate text-[12px] text-[#77767b]">{user.email}</p>
        </div>
      </div>

      {/* Role badge + custom perms indicator */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_COLOR[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
        {hasCustomPerms && (
          <span className="rounded-full bg-[#005cba]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#005cba] dark:bg-[#60a5fa]/10 dark:text-[#60a5fa]">
            {customCount} módulo{customCount !== 1 ? "s" : ""} customizado{customCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onPermissions}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[rgba(0,92,186,0.2)] bg-[#005cba]/5 px-3 py-2 text-[12px] font-semibold text-[#005cba] transition hover:bg-[#005cba]/10 dark:border-[#60a5fa]/20 dark:bg-[#60a5fa]/5 dark:text-[#60a5fa]"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          Permissões
        </button>
        <button
          onClick={onEdit}
          className="rounded-xl border border-[rgba(0,0,0,0.08)] px-3 py-2 text-[12px] font-medium text-[#46464a] transition hover:bg-[#f3f3f5] dark:border-white/8 dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
        >
          Editar
        </button>
        <button
          onClick={onToggleActive}
          className={`rounded-xl border px-3 py-2 text-[12px] font-medium transition ${
            user.isActive
              ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
              : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          }`}
        >
          {user.isActive ? "Desativar" : "Ativar"}
        </button>
      </div>
    </div>
  );
}

const ROLE_SECTIONS: { role: Role; label: string; icon: string }[] = [
  { role: "ADMIN",        label: "Administradores", icon: "👑" },
  { role: "COMERCIAL",    label: "Comercial",        icon: "📊" },
  { role: "ORCAMENTISTA", label: "Orçamentistas",    icon: "📄" },
  { role: "MARKETING",    label: "Marketing",        icon: "📣" },
  { role: "RH",           label: "RH",               icon: "👥" },
  { role: "ALMOXARIFADO", label: "Almoxarifado",     icon: "📦" },
  { role: "MEMBER",       label: "Membros",           icon: "👤" },
];

/* ─── Main Page ─── */
export function UsersAdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [permUser, setPermUser] = useState<AdminUser | null>(null);

  function reload() {
    usersApi.list().then(setUsers);
  }

  useEffect(reload, []);

  async function toggleActive(u: AdminUser) {
    if (u.isActive) {
      await usersApi.deactivate(u.id);
    } else {
      await usersApi.activate(u.id);
    }
    reload();
  }

  const activeUsers  = users.filter((u) => u.isActive);
  const inactiveUsers = users.filter((u) => !u.isActive);

  function renderCard(u: AdminUser) {
    return (
      <UserCard
        key={u.id}
        user={u}
        onEdit={() => setEditingUser(u)}
        onPermissions={() => setPermUser(u)}
        onToggleActive={() => toggleActive(u)}
      />
    );
  }

  return (
    <div className="min-h-full overflow-y-auto p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#030304] dark:text-[#e0e0e2]">Usuários</h1>
          <p className="mt-1 text-[14px] text-[#46464a] dark:text-[#a0a0a4]">
            {users.length} usuário{users.length !== 1 ? "s" : ""} · {activeUsers.length} ativo{activeUsers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-[#005cba] px-5 py-2.5 text-[13px] font-semibold text-white shadow transition hover:bg-[#0047a3] active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Novo usuário
        </button>
      </div>

      {/* Sections by role */}
      <div className="flex flex-col gap-10">
        {ROLE_SECTIONS.map(({ role, label, icon }) => {
          const group = activeUsers.filter((u) => u.role === role);
          if (group.length === 0) return null;
          return (
            <section key={role}>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <p className="text-[12px] font-semibold uppercase tracking-widest text-[#46464a] dark:text-[#a0a0a4]">
                  {label}
                </p>
                <span className="rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[11px] font-semibold text-[#77767b] dark:bg-[#222426] dark:text-[#a0a0a4]">
                  {group.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map(renderCard)}
              </div>
            </section>
          );
        })}

        {/* Inactive */}
        {inactiveUsers.length > 0 && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-base">🔒</span>
              <p className="text-[12px] font-semibold uppercase tracking-widest text-[#46464a] dark:text-[#a0a0a4]">
                Inativos
              </p>
              <span className="rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[11px] font-semibold text-[#77767b] dark:bg-[#222426] dark:text-[#a0a0a4]">
                {inactiveUsers.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {inactiveUsers.map(renderCard)}
            </div>
          </section>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={reload} />
      )}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={reload}
        />
      )}
      {permUser && (
        <PermissionsPanel
          user={permUser}
          onClose={() => setPermUser(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

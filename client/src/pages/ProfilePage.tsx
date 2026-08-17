import { useRef, useState, useEffect, type FormEvent } from "react";
import { usersApi } from "../api/users";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/common/Avatar";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { ROLE_LABELS } from "../types";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSuccess, setSmtpSuccess] = useState(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  useEffect(() => {
    usersApi.getMyEmailSettings().then((s) => {
      if (s.smtpEmail) { setSmtpEmail(s.smtpEmail); setSmtpConfigured(true); }
    }).catch(() => {});
  }, []);

  if (!user) return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarError("Use uma imagem PNG, JPEG ou WEBP.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setAvatarError("A imagem deve ter no máximo 2MB.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const updated = await usersApi.updateMyAvatar(dataUrl);
      updateUser({ avatarUrl: updated.avatarUrl });
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "Não foi possível enviar a foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(false);
    if (newPwd !== confirmPwd) {
      setPwdError("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (newPwd.length < 6) {
      setPwdError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setPwdSaving(true);
    try {
      await authApi.changePassword(currentPwd, newPwd);
      setPwdSuccess(true);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : "Não foi possível alterar a senha");
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className="mx-auto h-full max-w-xl overflow-y-auto p-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-gray-900">Meu perfil</h1>
      <p className="mb-6 text-sm text-gray-500">Gerencie suas informações e preferências</p>

      {/* Avatar */}
      <Card className="mb-4 p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
          <div>
            <p className="font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="mt-0.5 text-xs text-gray-400">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="mb-1 text-sm font-medium text-gray-700">Foto de perfil</p>
          <p className="mb-3 text-xs text-gray-500">PNG, JPEG ou WEBP, até 2 MB.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          {avatarError && <p className="mb-3 text-sm text-brand-dark">{avatarError}</p>}
          <Button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? "Enviando..." : "Escolher foto"}
          </Button>
        </div>
      </Card>


      {/* Email SMTP */}
      <Card className="mb-4 p-6">
        <p className="mb-1 text-sm font-medium text-gray-700">E-mail para envio de orçamentos</p>
        <p className="mb-4 text-xs text-gray-500">
          Configure seu e-mail Google Workspace e uma{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-brand underline">
            senha de app
          </a>{" "}
          para enviar propostas diretamente pelo sistema.
          {smtpConfigured && <span className="ml-2 text-green-600 font-medium">✓ Configurado</span>}
        </p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setSmtpError(null); setSmtpSuccess(false); setSmtpSaving(true);
          try {
            await usersApi.updateMyEmailSettings(smtpEmail, smtpPassword);
            setSmtpSuccess(true); setSmtpConfigured(true); setSmtpPassword("");
          } catch (err) {
            setSmtpError(err instanceof Error ? err.message : "Erro ao salvar");
          } finally { setSmtpSaving(false); }
        }} className="space-y-3">
          <input
            type="email" placeholder="seu@grafinorte.com.br" value={smtpEmail}
            onChange={(e) => setSmtpEmail(e.target.value)} required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <input
            type="password" placeholder="Senha de app (16 caracteres)" value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)} required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          {smtpError && <p className="text-sm text-red-600">{smtpError}</p>}
          {smtpSuccess && <p className="text-sm text-green-600">Configurações salvas!</p>}
          <Button type="submit" disabled={smtpSaving}>
            {smtpSaving ? "Salvando..." : "Salvar configurações de e-mail"}
          </Button>
        </form>
      </Card>

      {/* Password */}
      <Card className="p-6">
        <p className="mb-4 text-sm font-medium text-gray-700">Alterar senha</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <input
            type="password"
            placeholder="Senha atual"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <input
            type="password"
            placeholder="Nova senha (mínimo 6 caracteres)"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          {pwdError && <p className="text-sm text-brand-dark">{pwdError}</p>}
          {pwdSuccess && <p className="text-sm text-green-600">Senha alterada com sucesso!</p>}
          <Button type="submit" disabled={pwdSaving}>
            {pwdSaving ? "Salvando..." : "Alterar senha"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

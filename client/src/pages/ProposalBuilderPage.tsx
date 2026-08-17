import { useRef, useState, type DragEvent } from "react";
import { proposalApi, type ExtractedProposal, type ProposalItem } from "../api/proposal";
import { ApiError } from "../api/client";
import { CrmSubNav } from "../components/crm/CrmSubNav";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(",")[1], mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const empty = (): ExtractedProposal => ({
  numeroOrcamento: "", clienteNome: "", clienteContato: "",
  data: "", tituloProduto: "", especificacoes: "",
  itens: [{ numero: "01", quantidade: "", valorUnitario: "", valorTotal: "", melhorCusto: false }],
  condicoes: "", observacoes: "", vendedor: "", orcamentista: "", responsavel: "",
});

// ─── Estilos comuns ────────────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  width: "210mm", minHeight: "297mm", position: "relative",
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  boxSizing: "border-box", pageBreakAfter: "always", breakAfter: "page",
};

const LABEL: React.CSSProperties = {
  fontSize: "8px", letterSpacing: "3px", textTransform: "uppercase" as const,
  color: "#D81F26", fontWeight: 700, marginBottom: "4px",
};

// ─── PÁGINA 1: Capa ───────────────────────────────────────────────────────────

function CoverPage({ data }: { data: ExtractedProposal }) {
  return (
    <div style={{ ...PAGE, background: "#111", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Foto de fundo */}
      <img
        src="/assets/capa.jpg"
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.65 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      {/* Gradiente escuro na parte inferior */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%", background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.92))" }} />

      {/* Conteúdo */}
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Topo */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "28px 32px" }}>
          <img src="/assets/logo-mark.png" alt="Grafinorte" style={{ height: "36px", filter: "brightness(10)" }} />
          <div style={{ textAlign: "right", color: "rgba(255,255,255,0.75)", fontSize: "8px", letterSpacing: "3px", lineHeight: 1.8 }}>
            <div>APUCARANA · PR</div>
            <div>GRUPO TRIBUNA</div>
          </div>
        </div>

        {/* Espaçador */}
        <div style={{ flex: 1 }} />

        {/* Bloco inferior */}
        <div style={{ padding: "0 32px 32px" }}>
          {/* "PROPOSTA COMERCIAL" */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <div style={{ width: "20px", height: "2px", background: "#D81F26" }} />
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "8px", letterSpacing: "4px", textTransform: "uppercase" }}>PROPOSTA COMERCIAL</span>
          </div>

          {/* Headline */}
          <div style={{ color: "#fff", fontSize: "44px", fontWeight: 800, lineHeight: 1.08, marginBottom: "28px" }}>
            Impressão que<br />valoriza cada<br /><em style={{ fontStyle: "italic", color: "#e8e8e8" }}>detalhe.</em>
          </div>

          {/* Linha divisória */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.2)", marginBottom: "20px" }} />

          {/* Preparado para + Data */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "8px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "5px" }}>PREPARADO PARA</div>
              <div style={{ color: "#fff", fontSize: "22px", fontWeight: 400 }}>{data.clienteNome || "—"}</div>
            </div>
            {data.data && (
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "8px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "4px" }}>DATA</div>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px" }}>Apucarana, {data.data}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PÁGINA 2: Quem Somos (estática) ─────────────────────────────────────────

function QuemSomosPage() {
  return (
    <div style={{ ...PAGE, background: "#fff", display: "flex", flexDirection: "column" }}>
      {/* Topo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 32px 0" }}>
        <img src="/assets/logo-mark.png" alt="Grafinorte" style={{ height: "32px" }} />
        <span style={{ fontSize: "8px", letterSpacing: "3px", color: "#aaa", textTransform: "uppercase" }}>QUEM SOMOS</span>
      </div>

      <div style={{ padding: "28px 32px", flex: 1 }}>
        {/* Label */}
        <div style={{ ...LABEL, marginBottom: "10px" }}>DESDE 2000 · GRUPO TRIBUNA</div>

        {/* Headline */}
        <div style={{ fontSize: "36px", fontWeight: 400, color: "#111", lineHeight: 1.15, marginBottom: "20px" }}>
          Imprimimos ideias<br />há mais de <span style={{ color: "#D81F26", fontWeight: 700 }}>33 anos</span>.
        </div>

        {/* Parágrafo */}
        <p style={{ fontSize: "12px", color: "#444", lineHeight: 1.75, maxWidth: "480px", marginBottom: "28px" }}>
          A Grafinorte, empresa do Grupo Tribuna, ocupa uma área de mais de 20.000 m² em Apucarana-PR,
          com um dos parques gráficos mais avançados do Brasil. Trabalhamos com máquinas offset planas e
          rotativas de última geração e uma ampla linha de acabamento, atendendo desde pequenas até grandes
          tiragens com precisão, agilidade e entrega para todo o país.
        </p>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0", border: "1px solid #e5e5e5", borderRadius: "6px", marginBottom: "28px", overflow: "hidden" }}>
          {[
            ["33+", "ANOS DE MERCADO"],
            ["20mil", "M² DE PARQUE\nFABRIL"],
            ["2", "OFFSET PLANA &\nROTATIVA"],
            ["BR", "ENTREGA NACIONAL"],
          ].map(([n, l], i) => (
            <div key={n} style={{ padding: "16px 18px", borderLeft: i > 0 ? "1px solid #e5e5e5" : "none" }}>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "#111", lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: "8px", color: "#888", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "6px", whiteSpace: "pre-line", lineHeight: 1.5 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Bullets 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 40px", marginBottom: "32px" }}>
          {[
            ["Qualidade em cada projeto", "Acabamento refinado e alta precisão de impressão."],
            ["Inovação contínua", "Maquinário de última geração e eficiência produtiva."],
            ["Atendimento personalizado", "Suporte do projeto à escolha de materiais e acabamentos."],
            ["Ética e transparência", "Compromisso e responsabilidade em todas as relações."],
          ].map(([t, d]) => (
            <div key={t} style={{ display: "flex", gap: "10px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#D81F26", flexShrink: 0, marginTop: "3px" }} />
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#111", marginBottom: "2px" }}>{t}</div>
                <div style={{ fontSize: "11px", color: "#666", lineHeight: 1.5 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FSC box */}
        <div style={{ background: "#1a1a1a", borderRadius: "8px", padding: "16px 20px", display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <div style={{ background: "#D81F26", borderRadius: "6px", padding: "6px 8px", flexShrink: 0 }}>
            <div style={{ color: "#fff", fontSize: "10px", fontWeight: 800, lineHeight: 1 }}>FSC®</div>
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Impressão socialmente responsável e ambientalmente correta</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", lineHeight: 1.5 }}>Energia solar própria e certificação FSC® de manejo florestal responsável em toda a nossa produção.</div>
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ padding: "10px 32px", borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "9px", color: "#aaa" }}>Av. Zilda Seixas Amaral, 4270 · Apucarana — PR</span>
        <span style={{ fontSize: "9px", color: "#aaa" }}>(43) 3420-7777 · contato@grafinorte.com.br</span>
      </div>
    </div>
  );
}

// ─── PÁGINA 3: Proposta de Produção ──────────────────────────────────────────

function ProposalPage({ data }: { data: ExtractedProposal }) {
  const melhorIdx = data.itens.findIndex((i) => i.melhorCusto);
  const bestIdx = melhorIdx >= 0 ? melhorIdx : -1;

  return (
    <div style={{ ...PAGE, background: "#fff", display: "flex", flexDirection: "column" }}>
      {/* Topo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 32px 0" }}>
        <img src="/assets/logo-mark.png" alt="Grafinorte" style={{ height: "32px" }} />
        {data.numeroOrcamento && (
          <span style={{ fontSize: "8px", letterSpacing: "3px", color: "#aaa", textTransform: "uppercase" }}>ORÇAMENTO Nº {data.numeroOrcamento}</span>
        )}
      </div>

      <div style={{ padding: "20px 32px", flex: 1 }}>
        {/* Label + Título */}
        <div style={{ ...LABEL }}>PROPOSTA DE PRODUÇÃO</div>
        <div style={{ fontSize: "30px", fontWeight: 700, color: "#111", lineHeight: 1.15, marginBottom: "20px" }}>
          {data.tituloProduto || "—"}
        </div>

        {/* Caixa cliente */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0", border: "1px solid #e5e5e5", borderRadius: "6px", marginBottom: "12px", overflow: "hidden" }}>
          {[
            ["CLIENTE", data.clienteNome],
            ["CONTATO", data.clienteContato],
            ["DATA · APUCARANA", data.data],
          ].map(([l, v], i) => (
            <div key={l} style={{ padding: "12px 16px", borderLeft: i > 0 ? "1px solid #e5e5e5" : "none" }}>
              <div style={{ fontSize: "8px", letterSpacing: "2px", color: "#aaa", textTransform: "uppercase", marginBottom: "4px" }}>{l}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>{v || "—"}</div>
            </div>
          ))}
        </div>

        {/* Caixa especificações */}
        {data.especificacoes && (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: "6px", padding: "12px 16px", marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", color: "#333", lineHeight: 1.6 }}>
              {data.especificacoes.split(" · ").map((spec, i) => {
                const [k, v] = spec.split(": ");
                return (
                  <span key={i} style={{ marginRight: "20px", display: "inline-block" }}>
                    <span style={{ fontWeight: 700 }}>{k}{v ? ":" : ""}</span>
                    {v && <span style={{ fontWeight: 400, color: "#555" }}> {v}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabela de itens */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
          <thead>
            <tr style={{ background: "#222" }}>
              {["ITEM", "QUANTIDADE", "UNITÁRIO", "TOTAL"].map((h, i) => (
                <th key={h} style={{ padding: "10px 14px", color: "#fff", fontSize: "8px", letterSpacing: "2px", fontWeight: 700, textAlign: i === 0 ? "center" : i === 1 ? "left" : "right" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.itens.map((item, idx) => {
              const isBest = idx === bestIdx || item.melhorCusto;
              return (
                <tr key={idx} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "16px 14px", textAlign: "center", fontSize: "12px", fontWeight: 500, color: isBest ? "#D81F26" : "#555", verticalAlign: "middle" }}>
                    {item.numero || String(idx + 1).padStart(2, "0")}
                  </td>
                  <td style={{ padding: "16px 14px", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "22px", fontWeight: 700, color: isBest ? "#D81F26" : "#111" }}>
                        {item.quantidade.split(" ")[0]}
                      </span>
                      <span style={{ fontSize: "11px", color: "#888" }}>
                        {item.quantidade.split(" ").slice(1).join(" ")}
                      </span>
                      {isBest && (
                        <span style={{ background: "#f0f0f0", borderRadius: "4px", padding: "2px 7px", fontSize: "8px", fontWeight: 700, letterSpacing: "1px", color: "#444", textTransform: "uppercase" }}>
                          MELHOR CUSTO/UN.
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "16px 14px", textAlign: "right", fontSize: "12px", color: "#555", verticalAlign: "middle" }}>
                    {item.valorUnitario}
                  </td>
                  <td style={{ padding: "16px 14px", textAlign: "right", fontSize: "14px", fontWeight: 700, color: isBest ? "#D81F26" : "#111", verticalAlign: "middle" }}>
                    {item.valorTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Condições + Observações */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          <div>
            <div style={{ ...LABEL, marginBottom: "10px" }}>CONDIÇÕES</div>
            {data.condicoes.split("\n").filter(Boolean).map((c, i) => {
              // Detecta se tem parte em negrito (após ":")
              const colonIdx = c.indexOf(": ");
              if (colonIdx > -1) {
                return (
                  <div key={i} style={{ fontSize: "11px", color: "#333", marginBottom: "5px", lineHeight: 1.5 }}>
                    {c.slice(0, colonIdx + 2)}<strong>{c.slice(colonIdx + 2)}</strong>
                  </div>
                );
              }
              return <div key={i} style={{ fontSize: "11px", color: "#333", marginBottom: "5px", lineHeight: 1.5 }}>{c}</div>;
            })}
          </div>
          <div>
            <div style={{ ...LABEL, marginBottom: "10px" }}>OBSERVAÇÕES</div>
            <p style={{ fontSize: "11px", color: "#333", lineHeight: 1.65, margin: 0 }}>{data.observacoes}</p>
          </div>
        </div>

        {/* Assinaturas */}
        {(data.vendedor || data.orcamentista || data.responsavel) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0", marginTop: "auto" }}>
            {[
              ["Vendedor", data.vendedor],
              ["Orçamentista", data.orcamentista],
              ["Responsável", data.responsavel],
            ].map(([label, name]) => name ? (
              <div key={label}>
                <div style={{ fontSize: "10px", color: "#aaa" }}>{label}</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#111" }}>{name}</div>
              </div>
            ) : null)}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ padding: "10px 32px", borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "9px", color: "#aaa" }}>Av. Zilda Seixas Amaral, 4270 · Apucarana — PR</span>
        <span style={{ fontSize: "9px", color: "#aaa" }}>(43) 3420-7777 · contato@grafinorte.com.br</span>
      </div>
    </div>
  );
}

// ─── Documento completo ───────────────────────────────────────────────────────

function ProposalDocument({ data }: { data: ExtractedProposal }) {
  return (
    <div id="proposta-doc">
      <CoverPage data={data} />
      <QuemSomosPage />
      <ProposalPage data={data} />
    </div>
  );
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function DropArea({
  onFile, loading, hasData,
}: {
  onFile: (f: File) => void;
  loading: boolean;
  hasData: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !loading && ref.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-all ${
        dragging ? "border-red-500 bg-red-50" : "border-gray-300 bg-gray-50 hover:border-red-400 hover:bg-red-50/40"
      }`}
    >
      <input ref={ref} type="file" accept=".pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {loading ? (
        <>
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-brand" />
          <p className="text-sm text-gray-500">Extraindo dados do orçamento...</p>
        </>
      ) : (
        <>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D81F26" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
          <p className="text-sm font-medium text-gray-700">
            {hasData ? "Solte outro orçamento para substituir" : "Arraste o orçamento aqui (PDF ou imagem)"}
          </p>
          <p className="text-xs text-gray-400">ou clique para selecionar</p>
        </>
      )}
    </div>
  );
}

// ─── Modal de impressão ───────────────────────────────────────────────────────

function PrintModal({ data, onClose }: { data: ExtractedProposal; onClose: () => void }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body > * { visibility: hidden; }
          #print-root, #print-root * { visibility: visible; }
          #print-root { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
          #print-toolbar { display: none !important; }
        }
      `}</style>
      <div id="print-root" style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column" }}>
        <div id="print-toolbar" style={{ background: "#111", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>Visualização — Proposta Grafinorte</span>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: "7px", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", fontSize: "13px", cursor: "pointer" }}>Fechar</button>
            <button onClick={() => window.print()} style={{ padding: "7px 20px", borderRadius: "7px", background: "#D81F26", border: "none", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Imprimir / Salvar PDF</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "32px", display: "flex", justifyContent: "center" }}>
          <div style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }}>
            <ProposalDocument data={data} />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ProposalBuilderPage() {
  const [data, setData] = useState<ExtractedProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  async function handleFile(file: File) {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) { setError("Use PDF, JPEG ou PNG."); return; }
    setLoading(true);
    setError(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const result = await proposalApi.extract(base64, mimeType);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao processar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  function updateItem(idx: number, field: keyof ProposalItem, value: string | boolean) {
    if (!data) return;
    const itens = data.itens.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    setData({ ...data, itens });
  }

  const inp = "w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-red-400 focus:outline-none";
  const lbl = "block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1";

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
      <h1 className="mb-1 text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Comercial</h1>
      <p className="mb-4 text-[17px] text-[#46464a]">Estruturação de Proposta</p>

      <CrmSubNav />

      <p className="mb-5 text-sm text-[#77767b]">Arraste o orçamento e gere a proposta no novo design automaticamente.</p>

      {/* Drop zone */}
      <DropArea onFile={handleFile} loading={loading} hasData={!!data} />

      {/* Erro */}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {!loading && data && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Dados extraídos. Confira abaixo e corrija se necessário.
        </div>
      )}

      {/* Formulário de revisão */}
      {data && !loading && (
        <div className="mt-5 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700">Revise os dados extraídos</p>

          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>Nº Orçamento</label><input className={inp} value={data.numeroOrcamento} onChange={(e) => setData({ ...data, numeroOrcamento: e.target.value })} /></div>
            <div><label className={lbl}>Data</label><input className={inp} value={data.data} onChange={(e) => setData({ ...data, data: e.target.value })} placeholder="DD/MM/AAAA" /></div>
            <div><label className={lbl}>Cliente</label><input className={inp} value={data.clienteNome} onChange={(e) => setData({ ...data, clienteNome: e.target.value })} /></div>
            <div><label className={lbl}>Contato</label><input className={inp} value={data.clienteContato} onChange={(e) => setData({ ...data, clienteContato: e.target.value })} /></div>
            <div className="col-span-2"><label className={lbl}>Produto / Serviço</label><input className={inp} value={data.tituloProduto} onChange={(e) => setData({ ...data, tituloProduto: e.target.value })} /></div>
          </div>

          <div><label className={lbl}>Especificações técnicas (separadas por " · ")</label><input className={inp} value={data.especificacoes} onChange={(e) => setData({ ...data, especificacoes: e.target.value })} placeholder="Med. aberta: X · Papel: Y · Cores: Z" /></div>

          {/* Itens */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={lbl}>Itens / Opções de quantidade</label>
              <button onClick={() => setData({ ...data, itens: [...data.itens, { numero: String(data.itens.length + 1).padStart(2, "0"), quantidade: "", valorUnitario: "", valorTotal: "", melhorCusto: false }] })} className="text-xs text-red-600 hover:underline">+ Adicionar</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[40px_1fr_1fr_1fr_80px_24px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <span>Nº</span><span>Quantidade</span><span>Unitário</span><span>Total</span><span>Melhor</span><span />
              </div>
              {data.itens.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[40px_1fr_1fr_1fr_80px_24px] items-center gap-2">
                  <input className={inp + " text-center"} value={item.numero} onChange={(e) => updateItem(idx, "numero", e.target.value)} />
                  <input className={inp} value={item.quantidade} onChange={(e) => updateItem(idx, "quantidade", e.target.value)} placeholder="500 impressos" />
                  <input className={inp} value={item.valorUnitario} onChange={(e) => updateItem(idx, "valorUnitario", e.target.value)} placeholder="R$ 1,85" />
                  <input className={inp} value={item.valorTotal} onChange={(e) => updateItem(idx, "valorTotal", e.target.value)} placeholder="R$ 925,00" />
                  <label className="flex cursor-pointer items-center justify-center gap-1 text-xs text-gray-600">
                    <input type="checkbox" checked={item.melhorCusto} onChange={(e) => updateItem(idx, "melhorCusto", e.target.checked)} className="accent-red-600" />
                    Melhor
                  </label>
                  <button onClick={() => setData({ ...data, itens: data.itens.filter((_, i) => i !== idx) })} disabled={data.itens.length === 1} className="text-gray-300 hover:text-red-500 disabled:opacity-0">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Condições (1 por linha)</label><textarea className={inp} rows={4} value={data.condicoes} onChange={(e) => setData({ ...data, condicoes: e.target.value })} /></div>
            <div><label className={lbl}>Observações</label><textarea className={inp} rows={4} value={data.observacoes} onChange={(e) => setData({ ...data, observacoes: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>Vendedor</label><input className={inp} value={data.vendedor} onChange={(e) => setData({ ...data, vendedor: e.target.value })} /></div>
            <div><label className={lbl}>Orçamentista</label><input className={inp} value={data.orcamentista} onChange={(e) => setData({ ...data, orcamentista: e.target.value })} /></div>
            <div><label className={lbl}>Responsável</label><input className={inp} value={data.responsavel} onChange={(e) => setData({ ...data, responsavel: e.target.value })} /></div>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={() => setShowPrint(true)} className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700">
              Visualizar e imprimir proposta
            </button>
          </div>
        </div>
      )}

      {showPrint && data && <PrintModal data={data} onClose={() => setShowPrint(false)} />}
    </div>
  );
}

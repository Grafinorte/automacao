import { api } from "./client";

export interface ProposalItem {
  numero: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  melhorCusto: boolean;
}

export interface ExtractedProposal {
  numeroOrcamento: string;
  clienteNome: string;
  clienteContato: string;
  data: string;
  tituloProduto: string;
  especificacoes: string;
  itens: ProposalItem[];
  condicoes: string;
  observacoes: string;
  vendedor: string;
  orcamentista: string;
  responsavel: string;
  _method?: "local" | "ai";
}

export const proposalApi = {
  extract: (fileBase64: string, mimeType: string) =>
    api.post<ExtractedProposal>("/proposal/extract", { fileBase64, mimeType }),
};

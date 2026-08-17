import { createContext, useContext, useState, type ReactNode } from "react";

export type HrCompany = "GRAFINORTE" | "TRIBUNA" | "PLUSPACK";

export const HR_COMPANIES: { id: HrCompany; label: string; logo: string }[] = [
  { id: "GRAFINORTE", label: "Grafinorte",  logo: "/assets/logo-grafinorte.png" },
  { id: "TRIBUNA",    label: "Tribuna PR",  logo: "/assets/logo-tribuna.png" },
  { id: "PLUSPACK",   label: "PlusPack",    logo: "/assets/logo-pluspack.png" },
];

interface HrCompanyCtx {
  company: HrCompany;
  setCompany: (c: HrCompany) => void;
}

const HrCompanyContext = createContext<HrCompanyCtx | null>(null);

const STORAGE_KEY = "hr_company";

function readStored(): HrCompany {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "GRAFINORTE" || v === "TRIBUNA" || v === "PLUSPACK") return v;
  return "GRAFINORTE";
}

export function HrCompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompanyState] = useState<HrCompany>(readStored);

  function setCompany(c: HrCompany) {
    localStorage.setItem(STORAGE_KEY, c);
    setCompanyState(c);
  }

  return (
    <HrCompanyContext.Provider value={{ company, setCompany }}>
      {children}
    </HrCompanyContext.Provider>
  );
}

export function useHrCompany() {
  const ctx = useContext(HrCompanyContext);
  if (!ctx) throw new Error("useHrCompany must be inside HrCompanyProvider");
  return ctx;
}

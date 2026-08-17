import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ProspectingProvider } from "./context/ProspectingContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { BoardPage } from "./pages/BoardPage";
import { UsersAdminPage } from "./pages/UsersAdminPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { CatalogPage } from "./pages/CatalogPage";
import { QuotesListPage } from "./pages/QuotesListPage";
import { NewQuotePage } from "./pages/NewQuotePage";
import { ChatPage } from "./pages/ChatPage";
import { CrmBoardPage } from "./pages/CrmBoardPage";
import { CrmDashboardPage } from "./pages/CrmDashboardPage";
import { ContactsPage } from "./pages/ContactsPage";
import { ProspectingPage } from "./pages/ProspectingPage";
import { CrmAgentPage } from "./pages/CrmAgentPage";
import { DealPage } from "./pages/DealPage";
import { ProfilePage } from "./pages/ProfilePage";
import { MarketingDashboardPage } from "./pages/MarketingDashboardPage";
import { MarketingContentPage } from "./pages/MarketingContentPage";
import { MarketingCampaignsPage } from "./pages/MarketingCampaignsPage";
import { HrDashboardPage } from "./pages/HrDashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { VacationsPage } from "./pages/VacationsPage";
import { HrLayout } from "./components/hr/HrLayout";
import { RkwPage } from "./pages/RkwPage";
import { ProposalBuilderPage } from "./pages/ProposalBuilderPage";
import { StockPage } from "./pages/StockPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { ProductionPage } from "./pages/ProductionPage";
import { ServicesPage } from "./pages/ServicesPage";
import { HrAssistantPage } from "./pages/HrAssistantPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";
import {
  FactoryIcon,
  FinanceIcon,
  CalendarIcon,
  ReportsIcon,
  HelpIcon,
} from "./components/icons/Icons";

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
        <ProspectingProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            {/* App — com sidebar */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/tarefas" element={<BoardPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/group/:groupId" element={<ChatPage />} />
              <Route path="/chat/:userId" element={<ChatPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              <Route path="/producao" element={<ProductionPage />} />
              <Route
                path="/financeiro"
                element={
                  <ComingSoonPage
                    title="Financeiro"
                    description="Controle financeiro e orçamento. Esta área ainda está sendo desenvolvida."
                    icon={<FinanceIcon className="h-8 w-8" />}
                  />
                }
              />
              <Route path="/documentos" element={<KnowledgePage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route
                path="/calendario"
                element={
                  <ComingSoonPage
                    title="Calendário"
                    description="Agenda e eventos da equipe. Esta área ainda está sendo desenvolvida."
                    icon={<CalendarIcon className="h-8 w-8" />}
                  />
                }
              />
              <Route
                path="/relatorios"
                element={
                  <ComingSoonPage
                    title="Relatórios"
                    description="Relatórios e indicadores da empresa. Esta área ainda está sendo desenvolvida."
                    icon={<ReportsIcon className="h-8 w-8" />}
                  />
                }
              />
              <Route
                path="/ajuda"
                element={
                  <ComingSoonPage
                    title="Ajuda"
                    description="Central de ajuda e suporte. Esta área ainda está sendo desenvolvida."
                    icon={<HelpIcon className="h-8 w-8" />}
                  />
                }
              />
              <Route element={<ProtectedRoute moduleId="orcamentos" />}>
                <Route path="/orcamentos" element={<QuotesListPage />} />
                <Route path="/orcamentos/novo" element={<NewQuotePage />} />
              </Route>
              <Route element={<ProtectedRoute moduleId="comercial" />}>
                <Route path="/comercial" element={<CrmDashboardPage />} />
                <Route path="/comercial/funil" element={<CrmBoardPage />} />
                <Route path="/comercial/deals/:dealId" element={<DealPage />} />
                <Route path="/comercial/contatos" element={<ContactsPage />} />
                <Route path="/comercial/prospeccao" element={<ProspectingPage />} />
                <Route path="/comercial/assistente" element={<CrmAgentPage />} />
              </Route>
              <Route element={<ProtectedRoute moduleId="marketing" />}>
                <Route path="/marketing" element={<MarketingDashboardPage />} />
                <Route path="/marketing/conteudo" element={<MarketingContentPage />} />
                <Route path="/marketing/campanhas" element={<MarketingCampaignsPage />} />
              </Route>
              <Route element={<ProtectedRoute moduleId="rh" />}>
                <Route element={<HrLayout />}>
                  <Route path="/rh" element={<HrDashboardPage />} />
                  <Route path="/rh/funcionarios" element={<EmployeesPage />} />
                  <Route path="/rh/ferias" element={<VacationsPage />} />
                  <Route path="/rh/assistente" element={<HrAssistantPage />} />
                </Route>
              </Route>
              <Route element={<ProtectedRoute moduleId="proposta" />}>
                <Route path="/proposta" element={<ProposalBuilderPage />} />
              </Route>
              <Route element={<ProtectedRoute moduleId="almoxarifado" />}>
                <Route path="/almoxarifado" element={<StockPage />} />
              </Route>
              <Route element={<ProtectedRoute moduleId="servicos" />}>
                <Route path="/servicos" element={<ServicesPage />} />
              </Route>
              <Route element={<ProtectedRoute moduleId="whatsapp" />}>
                <Route path="/whatsapp" element={<WhatsAppPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
                <Route path="/catalogo" element={<CatalogPage />} />
                <Route path="/usuarios" element={<UsersAdminPage />} />
                <Route path="/rkw" element={<RkwPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
        </ProspectingProvider>
        </NotificationProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

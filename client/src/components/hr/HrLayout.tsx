import { Outlet } from "react-router-dom";
import { HrCompanyProvider } from "../../context/HrCompanyContext";

export function HrLayout() {
  return (
    <HrCompanyProvider>
      <Outlet />
    </HrCompanyProvider>
  );
}

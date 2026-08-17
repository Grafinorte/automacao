import { Router } from "express";
import * as employeesController from "./employees.controller";
import * as salaryController from "./salary.controller";
import * as vacationsController from "./vacations.controller";
import * as documentsController from "./documents.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const hrRouter = Router();

hrRouter.use(requireAuth, requireRole("ADMIN", "RH"));

// Employees
hrRouter.get("/employees", asyncHandler(employeesController.getEmployees));
hrRouter.post("/employees", asyncHandler(employeesController.postEmployee));
hrRouter.get("/employees/:id", asyncHandler(employeesController.getEmployeeById));
hrRouter.patch("/employees/:id", asyncHandler(employeesController.patchEmployee));
hrRouter.delete("/employees/:id", asyncHandler(employeesController.deleteEmployee));

// Salary history
hrRouter.get(
  "/employees/:employeeId/salary-changes",
  asyncHandler(salaryController.getSalaryChanges)
);
hrRouter.post(
  "/employees/:employeeId/salary-changes",
  asyncHandler(salaryController.postSalaryChange)
);
hrRouter.delete("/salary-changes/:id", asyncHandler(salaryController.deleteSalaryChange));

// Vacations
hrRouter.get("/vacations", asyncHandler(vacationsController.getVacations));
hrRouter.get(
  "/employees/:employeeId/vacations",
  asyncHandler(vacationsController.getVacationsForEmployee)
);
hrRouter.post(
  "/employees/:employeeId/vacations",
  asyncHandler(vacationsController.postVacation)
);
hrRouter.patch("/vacations/:id", asyncHandler(vacationsController.patchVacation));
hrRouter.delete("/vacations/:id", asyncHandler(vacationsController.deleteVacation));

// Documents
hrRouter.get("/employees/:employeeId/documents", asyncHandler(documentsController.getDocuments));
hrRouter.post("/employees/:employeeId/documents", asyncHandler(documentsController.postDocument));
hrRouter.delete("/documents/:id", asyncHandler(documentsController.deleteDocument));

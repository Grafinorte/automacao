import { prisma } from "../../db/prisma";
import { saveDocumentFromDataUrl, deleteDocumentFile } from "../../utils/documentStorage";

export function listDocuments(employeeId: string) {
  return prisma.employeeDocument.findMany({
    where: { employeeId },
    orderBy: { uploadedAt: "desc" },
  });
}

export function createDocument(data: {
  employeeId: string;
  name: string;
  fileDataUrl: string;
  uploadedById: string;
}) {
  const fileUrl = saveDocumentFromDataUrl(data.employeeId, data.fileDataUrl);
  return prisma.employeeDocument.create({
    data: {
      employeeId: data.employeeId,
      name: data.name,
      fileUrl,
      uploadedById: data.uploadedById,
    },
  });
}

export async function deleteDocument(id: string) {
  const doc = await prisma.employeeDocument.findUniqueOrThrow({ where: { id } });
  await prisma.employeeDocument.delete({ where: { id } });
  deleteDocumentFile(doc.fileUrl);
}

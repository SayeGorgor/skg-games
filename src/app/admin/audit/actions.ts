"use server";
import { requireAuditRead } from "@/lib/admin/audit/access";
import { readAuditHistory } from "@/lib/admin/audit/reader";

export async function searchAuditHistory(form: FormData) {
  await requireAuditRead();
  return readAuditHistory(form);
}

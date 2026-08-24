import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function InventoryMovementsPage() { redirect("/inventory/stock?section=movements"); }

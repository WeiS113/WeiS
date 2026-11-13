import { redirect } from "next/navigation";

// The legacy workspace has been migrated into the unified portfolio risk center.
export default function LegacyFinanceRedirect(){
  redirect("/finance");
}

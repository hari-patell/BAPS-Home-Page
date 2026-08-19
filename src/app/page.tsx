import { DashboardClient } from "@/components/DashboardClient";
import { getDashboardData } from "@/lib/data";

export const revalidate = 1800;

export default async function Home() {
  const data = await getDashboardData();
  return <DashboardClient initialData={data} />;
}

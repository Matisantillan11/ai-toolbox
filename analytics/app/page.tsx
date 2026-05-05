import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard"
import { getAnalyticsDashboardData } from "@/lib/analytics"

export const dynamic = "force-dynamic"

export default function Home() {
  const data = getAnalyticsDashboardData()

  return <AnalyticsDashboard data={data} />
}

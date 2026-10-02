import { AgentDashboard } from "@/features/ai-agent/agent-dashboard";
/** Keeps the simulator and conversation alive while changing agent sections. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AgentDashboard />
      {children}
    </>
  );
}

import { NavLink, Outlet, Route, Routes } from "react-router-dom";

import { cn } from "@/lib/utils";
import { ParticipantPage } from "@/pages/ParticipantPage";
import { ResultsPage } from "@/pages/ResultsPage";
import { ScanPage } from "@/pages/ScanPage";
import { SurveyDetailPage } from "@/pages/SurveyDetailPage";
import { SurveyListPage } from "@/pages/SurveyListPage";
import { SurveyNewPage } from "@/pages/SurveyNewPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SurveyListPage />} />
        <Route path="surveys" element={<SurveyListPage />} />
        <Route path="surveys/new" element={<SurveyNewPage />} />
        <Route path="surveys/:id" element={<SurveyDetailPage />} />
        <Route path="surveys/:id/results" element={<ResultsPage />} />
        <Route path="scan" element={<ScanPage />} />
      </Route>
      {/* Participant view rendered without nav so respondents stay focused */}
      <Route path="surveys/:id/participate" element={<ParticipantPage />} />
    </Routes>
  );
}

function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between py-4">
          <NavLink to="/" className="text-sm font-mono text-muted-foreground">
            conjoint
          </NavLink>
          <nav className="flex gap-1 text-sm">
            <NavItem to="/surveys">Surveys</NavItem>
            <NavItem to="/scan">Variance scan</NavItem>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 hover:bg-accent",
          isActive && "bg-accent text-accent-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

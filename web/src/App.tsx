import { Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { ConfigurationPage } from "@/pages/ConfigurationPage";
import { ParticipantPage } from "@/pages/ParticipantPage";
import { ResultsPage } from "@/pages/ResultsPage";
import { ScanPage } from "@/pages/ScanPage";
import { SurveyDetailPage } from "@/pages/SurveyDetailPage";
import { SurveyListPage } from "@/pages/SurveyListPage";
import { SurveyNewPage } from "@/pages/SurveyNewPage";
import { TestPlanNewPage } from "@/pages/TestPlanNewPage";
import { TestPlansPage } from "@/pages/TestPlansPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<SurveyListPage />} />
        <Route path="surveys" element={<SurveyListPage />} />
        <Route path="surveys/new" element={<SurveyNewPage />} />
        <Route path="surveys/:id" element={<SurveyDetailPage />} />
        <Route path="surveys/:id/results" element={<ResultsPage />} />
        <Route path="test-plans" element={<TestPlansPage />} />
        <Route path="test-plans/new" element={<TestPlanNewPage />} />
        <Route path="configuration" element={<ConfigurationPage />} />
        <Route path="scan" element={<ScanPage />} />
      </Route>
      {/* Participant view rendered without nav so respondents stay focused */}
      <Route path="surveys/:id/participate" element={<ParticipantPage />} />
    </Routes>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, type SurveyOut } from "@/lib/api";

type ActiveSurveyContextValue = {
  surveys: SurveyOut[];
  activeSurvey: SurveyOut | null;
  setActiveSurvey: (survey: SurveyOut | null) => void;
  loading: boolean;
  refresh: () => void;
};

const ActiveSurveyContext = createContext<ActiveSurveyContextValue | null>(null);

const STORAGE_KEY = "active_survey_id";

export function ActiveSurveyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [surveys, setSurveys] = useState<SurveyOut[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .listSurveys({ testPlan: false })
      .then(setSurveys)
      .catch(() => setSurveys([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveSurvey = useCallback((survey: SurveyOut | null) => {
    setActiveId(survey?.id ?? null);
    if (survey) localStorage.setItem(STORAGE_KEY, survey.id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const activeSurvey = surveys.find((s) => s.id === activeId) ?? null;

  return (
    <ActiveSurveyContext.Provider
      value={{ surveys, activeSurvey, setActiveSurvey, loading, refresh }}
    >
      {children}
    </ActiveSurveyContext.Provider>
  );
}

export function useActiveSurvey(): ActiveSurveyContextValue {
  const ctx = useContext(ActiveSurveyContext);
  if (!ctx) {
    throw new Error("useActiveSurvey must be used within ActiveSurveyProvider");
  }
  return ctx;
}

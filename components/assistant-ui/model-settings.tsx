"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuiState } from "@assistant-ui/react";
import {
  isModelChoice,
  modelLabel,
  type ModelChoice,
  DEFAULT_MODEL_CHOICE,
} from "@/lib/model-catalog";
const Context = createContext<{
  ready: boolean;
  choice: ModelChoice;
  setChoice: (choice: ModelChoice) => void;
}>({ ready: false, choice: DEFAULT_MODEL_CHOICE, setChoice: () => {} });
export function ModelSettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [choice, setValue] = useState<ModelChoice>(DEFAULT_MODEL_CHOICE);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dreamforge:model-choice");
      if (isModelChoice(saved)) setValue(saved);
      else
        localStorage.setItem("dreamforge:model-choice", DEFAULT_MODEL_CHOICE);
    } catch {}
    setReady(true);
  }, []);
  const setChoice = (value: ModelChoice) => {
    setValue(value);
    try {
      localStorage.setItem("dreamforge:model-choice", value);
    } catch {}
  };
  return (
    <Context.Provider value={{ ready, choice, setChoice }}>
      {children}
    </Context.Provider>
  );
}
export const useModelSettings = () => useContext(Context);
export function ModelUsed() {
  const metadata = useAuiState(({ message }) => message.metadata);
  const custom = metadata?.custom as
    | { model?: string; modelsUsed?: string[] }
    | undefined;
  if (!custom?.model) return null;
  return (
    <span
      className="ml-auto self-center text-[10px] text-slate-400"
      title={custom.modelsUsed?.map(modelLabel).join(" → ")}
    >
      Used: {modelLabel(custom.model)}
    </span>
  );
}

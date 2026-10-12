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
} from "@/lib/model-catalog";
const Context = createContext<{
  choice: ModelChoice;
  setChoice: (choice: ModelChoice) => void;
}>({ choice: "auto", setChoice: () => {} });
export function ModelSettingsProvider({ children }: { children: ReactNode }) {
  const [choice, setValue] = useState<ModelChoice>("auto");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dreamforge:model-choice");
      if (saved === "qwen-large") setValue("qwen");
      else if (isModelChoice(saved)) setValue(saved);
    } catch {}
  }, []);
  const setChoice = (value: ModelChoice) => {
    setValue(value);
    try {
      localStorage.setItem("dreamforge:model-choice", value);
    } catch {}
  };
  return (
    <Context.Provider value={{ choice, setChoice }}>
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

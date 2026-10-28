"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useModelSettings } from "./model-settings";
import { useAuiState } from "@assistant-ui/react";
import { isModelChoice, MODEL_CHOICES, modelTier } from "@/lib/model-catalog";
type Model = { id: string; name: string; paid: boolean; available?: boolean };
const label = (model: Model) => model.name.replace(/\s*\(free\)$/, "");
export function ModelSelector() {
  const [models, setModels] = useState<Model[]>(
      MODEL_CHOICES.map((choice) => ({
        id: choice.id,
        name: choice.label,
        paid: true,
        available: modelTier(choice.id) === "basic",
      })),
    ),
    [open, setOpen] = useState(false);
  const { choice: selected, setChoice: setSelected } = useModelSettings();
  const running = useAuiState(({ thread }) => thread.isRunning);
  const [position, setPosition] = useState({ left: 0, bottom: 0 });
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/models", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setModels(data.choices || data.models);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [running]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          left: Math.max(12, Math.min(rect.left, window.innerWidth - 392)),
          bottom: window.innerHeight - rect.top + 8,
        });
    };
    place();
    const frame = requestAnimationFrame(() => {
      menu.current
        ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
        ?.focus();
    });
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!trigger.current?.contains(node) && !menu.current?.contains(node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  if (!models.length) return null;
  const active = models.find((model) => model.id === selected) || models[0];
  const activeLabel = label(active);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={running}
        aria-label={`Coding model: ${activeLabel}`}
        title={`${label(active)} · ${modelTier(selected) === "advanced" ? "Advanced" : "Basic"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "coding-model-menu" : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="mr-auto ml-1 inline-flex max-w-[220px] min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDownIcon
          className={`size-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id="coding-model-menu"
            role="menu"
            aria-label="Coding models"
            style={position}
            onBlur={(event) => {
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget as Node) &&
                event.relatedTarget !== trigger.current
              )
                setOpen(false);
            }}
            onKeyDown={(event) => {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitemradio"]',
                ),
              ).filter((button) => !button.disabled);
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }
            }}
            className="fixed z-[100] w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 text-slate-800 shadow-[0_8px_32px_rgba(15,23,42,0.12)]"
          >
            <p className="px-3 pt-2 pb-2.5 text-xs font-medium text-slate-400">
              Model
            </p>
            <div className="max-h-[50vh] overflow-y-auto">
              {[...models]
                .sort(
                  (a, b) =>
                    Number(
                      isModelChoice(a.id) && modelTier(a.id) === "advanced",
                    ) -
                    Number(
                      isModelChoice(b.id) && modelTier(b.id) === "advanced",
                    ),
                )
                .map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected === model.id}
                    disabled={model.available === false}
                    title={`${isModelChoice(model.id) && modelTier(model.id) === "advanced" ? "Advanced" : "Basic"}${model.available === false ? " · Available after prepaid billing launch" : ""}`}
                    onClick={() => {
                      if (isModelChoice(model.id)) setSelected(model.id);
                      setOpen(false);
                      trigger.current?.focus();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                  >
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      <span className="block">{label(model)}</span>
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {isModelChoice(model.id) &&
                      modelTier(model.id) === "advanced"
                        ? "Advanced"
                        : "Basic"}
                    </span>
                    {selected === model.id && (
                      <CheckIcon className="size-4 shrink-0 text-slate-700" />
                    )}
                  </button>
                ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

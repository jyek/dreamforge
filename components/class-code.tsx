import { Copy } from "lucide-react";
import { CopyButton } from "./copy-button";
export function ClassCode({ code }: { code?: string }) {
  return (
    <span className="df-class-code">
      Class code: <strong>{code || "—"}</strong>
      {code && (
        <CopyButton value={code} className="df-class-code-copy">
          <Copy size={15} aria-hidden="true" />
          <span className="sr-only">Copy class code</span>
        </CopyButton>
      )}
    </span>
  );
}

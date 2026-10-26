import { randomUUID } from "node:crypto";

// Preserve UUID entropy without digit runs that the student privacy filter
// correctly treats as potential phone numbers.
export function uiReplyMarker(id = randomUUID()) {
  return "E2E_UI_REPLY_" + id.replaceAll("-", "").replace(/[0-9]/g,
    digit => String.fromCharCode(103 + Number(digit)));
}

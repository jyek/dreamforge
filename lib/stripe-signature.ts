import { createHmac, timingSafeEqual } from "node:crypto";
export function verifiedStripeBody(
  raw: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const fields = signature.split(",").map((x) => x.split("="));
  const stamp = fields.find((x) => x[0] === "t")?.[1];
  if (
    !stamp ||
    !/^\d+$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${stamp}.${raw}`)
    .digest();
  return fields
    .filter((x) => x[0] === "v1")
    .some(([, hex]) => {
      if (!/^[a-f0-9]{64}$/.test(hex || "")) return false;
      return timingSafeEqual(expected, Buffer.from(hex, "hex"));
    });
}

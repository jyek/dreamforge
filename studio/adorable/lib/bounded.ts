/** Bound APIs that do not accept a timeout (for example browser page creation). */
export function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(Error("Operation timed out.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

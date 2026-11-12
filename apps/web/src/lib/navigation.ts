// Only follow http(s) URLs returned by our own API when sending the buyer to PayPal.
export function redirect(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Unsafe redirect URL");
  window.location.assign(u.toString());
}

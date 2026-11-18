export async function copyReport(text: string): Promise<"copied" | "manual"> {
  const previous=document.activeElement;
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { /* mobile permission fallback */ }
  const el=document.createElement("textarea");
  el.value=text; el.dir="rtl"; el.setAttribute("aria-label","דוח להעתקה ידנית");
  el.className="fixed inset-x-4 top-4 z-50 h-40 border bg-card p-3 text-foreground";
  document.body.append(el); el.focus(); el.select(); el.setSelectionRange(0,text.length);
  let ok=false;
  try { ok=document.execCommand("copy"); } catch { /* manual selection remains available */ }
  el.remove();
  if(previous instanceof HTMLElement) previous.focus({preventScroll:true});
  return ok ? "copied" : "manual";
}
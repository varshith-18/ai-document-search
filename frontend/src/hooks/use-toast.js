export function useToast() {
  function toast({ title, description, variant } = {}) {
    // Minimal toast shim; integrate a real toaster later
    const parts = [title, description].filter(Boolean).join(" — ");
    // eslint-disable-next-line no-console
    console.log(parts || "Toast", variant || "");
  }
  return { toast };
}

import { useEffect, useRef } from "react";

/** Editorial paper background with subtle ink washes that follow the cursor. */
export function InteractiveBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        el.style.setProperty("--mx", `${x}%`);
        el.style.setProperty("--my", `${y}%`);
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="paper-bg" aria-hidden="true">
      <div
        ref={ref}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(520px circle at var(--mx,30%) var(--my,30%), rgba(139,0,0,0.18), transparent 60%)",
          transition: "background 200ms linear",
        }}
      />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full blur-3xl animate-drift-a"
        style={{ background: "radial-gradient(circle, rgba(139,0,0,0.28), transparent 70%)" }}
      />
      <div
        className="absolute top-1/4 -right-40 h-[600px] w-[600px] rounded-full blur-3xl animate-drift-b"
        style={{ background: "radial-gradient(circle, rgba(91,2,2,0.32), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-48 left-1/3 h-[460px] w-[460px] rounded-full blur-3xl animate-drift-a"
        style={{ background: "radial-gradient(circle, rgba(32,14,1,0.18), transparent 70%)" }}
      />
      <div className="grain" />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const LAYERS = [
  { num: "01", tag: "PRELUDE" },
  { num: "02", tag: "SIGNAL" },
  { num: "03", tag: "CRISIS" },
  { num: "04", tag: "RESPONSE" },
  { num: "05", tag: "AFTERMATH" },
];

export default function ArchStrata() {
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const mouse = useRef({ x: 0, y: 0, active: false });
  const positions = useRef(LAYERS.map(() => ({ x: 0, y: 0 })));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const check = () => setShow(window.innerWidth > 1200);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const setBarRef = useCallback((el: HTMLDivElement | null, i: number) => {
    barsRef.current[i] = el;
  }, []);

  useEffect(() => {
    if (!show) return;

    function handleMove(e: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
      mouse.current.active = true;
    }

    function handleLeave() {
      mouse.current.active = false;
    }

    function animate() {
      const bars = barsRef.current;

      bars.forEach((bar, i) => {
        if (!bar) return;

        let targetX = 0;
        let targetY = 0;

        if (mouse.current.active) {
          const rect = bar.getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            const barCenterX = rect.left - containerRect.left + rect.width / 2;
            const barCenterY = rect.top - containerRect.top + rect.height / 2;

            const dx = mouse.current.x - barCenterX;
            const dy = mouse.current.y - barCenterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Magnetic repulsion — closer = stronger push
            const maxDist = 250;
            if (dist < maxDist) {
              const force = (1 - dist / maxDist) * (30 + i * 6);
              targetX = -(dx / dist) * force;
              targetY = -(dy / dist) * force * 0.4;
            }
          }
        }

        // Smooth lerp — each bar has slightly different speed
        const speed = 0.06 + i * 0.012;
        positions.current[i].x += (targetX - positions.current[i].x) * speed;
        positions.current[i].y += (targetY - positions.current[i].y) * speed;

        bar.style.transform = `translate(${positions.current[i].x}px, ${positions.current[i].y}px)`;
      });

      rafRef.current = requestAnimationFrame(animate);
    }

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMove);
      container.addEventListener("mouseleave", handleLeave);
    }
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMove);
        container.removeEventListener("mouseleave", handleLeave);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="strata-container" ref={containerRef}>
      <div className="strata-stack">
        {LAYERS.map((layer, i) => (
          <div
            key={i}
            className="strata-bar"
            ref={(el) => setBarRef(el, i)}
          >
            <span className="bar-num">CH.{layer.num}</span>
            <span className="bar-tag">{layer.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

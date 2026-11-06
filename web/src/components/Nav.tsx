"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ask" },
  { href: "/timeline", label: "Timeline" },
  { href: "/quality", label: "Quality" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="InForce home">
          <span className="brand-mark" aria-hidden>
            ◆
          </span>
          InForce
        </Link>
        <nav aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={active ? "nav-link active" : "nav-link"}
                    aria-current={active ? "page" : undefined}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

import { SiteLogo } from "../site-logo";
import { ThemeToggle } from "../theme-toggle";

export default function SysadminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between px-4 pt-3">
        <SiteLogo />
        <ThemeToggle />
      </header>
      {children}
    </>
  );
}

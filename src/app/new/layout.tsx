import { SiteLogo } from "../site-logo";

export default function NewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="px-4 pt-3">
        <SiteLogo />
      </header>
      {children}
    </>
  );
}

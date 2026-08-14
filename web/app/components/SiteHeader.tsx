import { Button, Link } from "@heroui/react";
import { readSession } from "../../lib/session";
import { signOutAction } from "../actions";

// One header on every page, so signing in is a visible button rather than a
// sentence someone has to notice.
export async function SiteHeader() {
  const session = await readSession();

  return (
    <header className="border-b border-black/5 bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
        <Link className="text-lg font-semibold text-foreground no-underline" href="/">
          HomeSafe
        </Link>
        {session ? (
          <nav className="flex items-center gap-3">
            <Link href="/me">My cases</Link>
            <span className="text-sm text-muted">{session.displayName}</span>
            <form action={signOutAction}>
              <Button size="sm" type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </nav>
        ) : (
          <form action="/signin" method="get">
            <Button size="sm" type="submit">
              Sign in
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}

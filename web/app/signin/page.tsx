import { Alert, Button, Input, Label, TextField } from "@heroui/react";
import { redirect } from "next/navigation";
import { signInAction } from "../actions";
import { readSession } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await readSession();
  if (session) redirect("/me");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">HomeSafe</h1>
        <p className="text-muted">
          Keep a record of what&rsquo;s happening in your home, see what the City of Boston
          knows about your building, and get answers that prove their sources.
        </p>
      </header>

      <form action={signInAction} className="flex flex-col gap-4">
        <TextField isRequired name="display_name">
          <Label>Your name</Label>
          <Input placeholder="Maya" />
        </TextField>
        <Button type="submit">Get started</Button>
      </form>

      <Alert>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Hackathon demo</Alert.Title>
          <Alert.Description>
            No password, no email. A name is enough to try it. Everything you write stays
            private to this session&rsquo;s account, enforced by the database, not by a promise.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </main>
  );
}

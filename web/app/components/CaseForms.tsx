"use client";

import { Button, Checkbox, Input, Label, TextArea, TextField } from "@heroui/react";
import { useFormStatus } from "react-dom";
import { addNoteAction, askAgentAction } from "../actions";
import { PhotoInput } from "./PhotoInput";

// The agent turn is measured at 10-12 seconds. A button that goes quiet for
// that long reads as broken, so both forms show their pending state.

function SubmitButton({ idle, busy }: { readonly idle: string; readonly busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button isDisabled={pending} isPending={pending} type="submit">
      {pending ? busy : idle}
    </Button>
  );
}

export function NoteForm({ caseId }: { readonly caseId: string }) {
  return (
    <form action={addNoteAction} className="flex flex-col gap-3">
      <input name="case_id" type="hidden" value={caseId} />
      <TextField isRequired name="body">
        <Label>Write down what happened</Label>
        <TextArea
          placeholder="No heat again last night. Told the landlord on the 4th."
          rows={3}
        />
      </TextField>
      <PhotoInput />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">Dated automatically. Only you can see it.</p>
        <SubmitButton busy="Saving…" idle="Save note" />
      </div>
    </form>
  );
}

export function AskForm({ caseId }: { readonly caseId: string }) {
  return (
    <form action={askAgentAction} className="flex flex-col gap-3">
      <input name="case_id" type="hidden" value={caseId} />
      <TextField isRequired name="question">
        <Label>Ask HomeSafe</Label>
        <Input placeholder="The heat is still out. What changed?" />
      </TextField>
      <div className="flex items-center justify-between gap-3">
        <Checkbox name="as_reviewer">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            Preview what a reviewer would see
          </Checkbox.Content>
        </Checkbox>
        <SubmitButton busy="Reading your case and its receipts…" idle="Ask" />
      </div>
    </form>
  );
}

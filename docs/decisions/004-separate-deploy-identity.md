# 004 — A separate identity for deploying, so the app can never deploy itself

**Decision.** Deploying the site uses a new IAM user, `homesafe-deploy`, that can do nothing
but deploy; the existing `homesafe-dev` identity keeps its two permissions and gains none.

**Why this came up.** Plan 2 starts by putting a Next.js app on AWS Amplify. The first
attempt failed immediately:

```
User: arn:aws:iam::953791390715:user/homesafe-dev
is not authorized to perform: amplify:ListApps
because no identity-based policy allows the amplify:ListApps action
```

That is not a bug. `homesafe-dev` was deliberately scoped in MOO-599 to exactly two things —
call Bedrock models, read and write one S3 bucket — because this whole project is an argument
that a system should only be able to reach what it actually needs. The deploy is genuinely
new work that identity was never meant to do, so the question was where to put it.

What was at stake: the demo says out loud that the application identity is scoped to two
capabilities. If we widen it to three so a deploy works, that sentence stops being true, and
the first person to check the policy finds the project arguing for a discipline it dropped the
moment it was inconvenient.

**Options.**

1. **Widen `homesafe-dev`.** One policy edit, about a minute. Real cost: one identity then does
   both runtime and deploy, so a leaked application key can silently redeploy the live site —
   and the project's central claim gets a footnote.
2. **A second identity, `homesafe-deploy`.** Roughly five minutes more. Real cost: two sets of
   credentials to keep track of, and a second thing to remember to revoke at the end.
3. **Deploy by hand from the console.** No new credentials at all. Real cost: nothing is
   reproducible, and CI can never do it — which pushes the problem to a worse moment.

**What we chose and why.** Option 2 — a separate `homesafe-deploy` user (Tarik's call, from
two options I put up). It keeps the sentence in the demo literally true, and it means the
running application cannot change the site it is running on. The extra five minutes buys the
credibility of the thing being demonstrated.

**What we gave up.** Two credentials instead of one, and a second thing to revoke when the
hackathon ends. There is also a real chance the deploy user's policy ends up broader than it
should be, because Amplify's required actions are not obvious and the tempting fix under time
pressure is `amplify:*`. That is a known weak point, not a solved one.

**How we'll know if this was right.** `homesafe-dev` still fails on `amplify:ListApps` after
the site is live, and `homesafe-deploy` still fails on `bedrock:InvokeModel`. Both denials are
worth screenshotting — they are the same class of evidence as the MOO-604 grant boundary.

**What actually happened.**

<!-- Tarik fills this in. -->

import { Newsreader } from "next/font/google";
import { SearchField, Card, Chip, Link as HLink } from "@heroui/react";
import { candidatesFor, type AddressCandidate } from "../lib/evidence";
import { StatCounter } from "./components/StatCounter";
import "./landing.css";

// Hallmark Stat-Led landing. The address search that used to be this whole
// page lives on as a working section — same route, same ?q= contract, so
// nothing that linked here breaks.
export const dynamic = "force-dynamic";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["700"],
  style: ["normal"],
  variable: "--hs-font-newsreader",
});

// Every number on this page is measured, current as of 2026-08-14, and
// reproducible from the repo. If one drifts, fix it here — an invented or
// stale metric on a page about provenance would be self-refuting.
const PUBLIC_RECORDS = 1_062_729;
const REPO_URL = "https://github.com/tmoody1973/homesafe";

function Candidates({
  candidates,
  query,
}: {
  readonly candidates: readonly AddressCandidate[];
  readonly query: string;
}) {
  if (candidates.length === 0) {
    return (
      <p className="lede">
        No Boston address matched &ldquo;{query}&rdquo;. Try the street number and name,
        like &ldquo;302 Sumner St&rdquo;.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {candidates.map((candidate) => (
        <li key={candidate.samAddressId}>
          <Card>
            <Card.Header>
              <Chip>
                <Chip.Label>{candidate.matchConfidence}</Chip.Label>
              </Chip>
              <Card.Title>
                <HLink href={`/address/${candidate.samAddressId}`}>
                  {candidate.fullAddress}
                </HLink>
              </Card.Title>
              <Card.Description>
                Boston address ID {candidate.samAddressId}
              </Card.Description>
            </Card.Header>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default async function Home(props: PageProps<"/">) {
  const params = await props.searchParams;
  const raw = typeof params.q === "string" ? params.q.trim() : "";
  const candidates = raw === "" ? null : await candidatesFor(raw);

  return (
    <div className={`hs-landing ${newsreader.variable}`}>
      <section className="hs-hero">
        <div className="hs-wrap">
          <div aria-hidden="true" className="figure">
            <StatCounter value={PUBLIC_RECORDS} />
          </div>
          <h1>
            public records about Boston homes, remembered for the people who live in
            them.
          </h1>
          <p className="qualifier">
            HomeSafe pairs the city&rsquo;s own data with a renter&rsquo;s private, dated
            journal and an agent that answers questions with receipts: every claim cites a
            source it actually read, and anything it can&rsquo;t prove gets deleted before
            you see it.
          </p>
          <div className="hs-cta-row">
            <a className="hs-btn hs-btn--primary" href="/signin">
              Try the live demo
            </a>
            <a className="hs-btn" href={REPO_URL} rel="noopener noreferrer" target="_blank">
              Read the code
            </a>
          </div>
        </div>
      </section>

      <figure className="hs-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Rooflines of multi-family homes in a Boston residential neighborhood under an overcast sky"
          src="/boston-homes.jpg"
        />
        <figcaption className="hs-wrap">
          The housing stock the records describe: triple-deckers and multi-family homes.
          Photo: Zixi Zhou, Unsplash.
        </figcaption>
      </figure>

      <section>
        <div className="hs-wrap">
          <div className="hs-search-grid">
            <div>
              <h2>Look up any Boston address, right now</h2>
              <p className="lede">
                Violations, permits, and housing complaints, each labeled with how
                confidently it was matched, and what it does not prove. A permit is never
                presented as a repair.
              </p>
            </div>
            <div>
              <form className="flex flex-col gap-3" method="get">
                <SearchField defaultValue={raw} name="q">
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input
                      aria-label="Boston street address"
                      className="w-full"
                      placeholder="302 Sumner St"
                    />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
              </form>
              {candidates !== null && (
                <div className="mt-6">
                  <Candidates candidates={candidates} query={raw} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="hs-wrap">
          <h2>How it helps a renter hold a landlord accountable</h2>
          <div className="hs-steps">
            <div>
              <h3>A journal that stands up</h3>
              <p>
                Dated, private notes. Photos are described by you, never analyzed by the
                AI, and location data is stripped before an image leaves your phone.
              </p>
            </div>
            <div>
              <h3>Your building&rsquo;s paper trail</h3>
              <p>
                One real six-unit building in Roxbury carries 53 heat complaints and one
                permit. One complaint is a story; fifty-three is a pattern an inspector
                can act on.
              </p>
            </div>
            <div>
              <h3>Answers with receipts</h3>
              <p>
                The agent reads your notes, the city&rsquo;s records, and the Massachusetts
                sanitary code, and shows exactly what it read. If it cannot cite a claim,
                it deletes the claim and tells you it did.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="hs-wrap">
          <h2>The hackathon criteria, exceeded</h2>
          <table className="hs-spec">
            <caption>
              Every row is verifiable in the repo: tests, evidence files, and decision
              docs are linked from the README.
            </caption>
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th className="req" scope="col">
                  Required
                </th>
                <th scope="col">What HomeSafe ships</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CockroachDB tools</td>
                <td className="req">at least 2</td>
                <td>
                  <mark>All 4</mark>: distributed vector indexing (1024-dim,
                  consent-filtered), managed MCP at build time with findings filed as
                  feedback, ccloud for the two-login security model, and the Agent Skills
                  repo doing load-bearing privilege work.
                </td>
              </tr>
              <tr>
                <td>AWS services</td>
                <td className="req">at least 1</td>
                <td>
                  3: Bedrock (agent + embeddings via a role that can invoke exactly two
                  models, no keys in the build), Amplify Hosting, S3.
                </td>
              </tr>
              <tr>
                <td>Store, retrieve, act on memory</td>
                <td className="req">the challenge</td>
                <td>
                  All three verbs, live: the agent writes its own conclusions back to
                  memory, recalls them next session by meaning, and drafts approval-gated
                  tasks. Six kinds of memory in one cluster: records, journal, vectors,
                  agent diary, task state, audit log.
                </td>
              </tr>
              <tr>
                <td>Memory not an afterthought</td>
                <td className="req">the judging bar</td>
                <td>
                  Memory that <mark>proves itself</mark>: every answer ships a receipt of
                  what was read, written by the retrieval layer. The model cannot author
                  it. The receipt is also the audit row and the validator&rsquo;s source
                  of truth.
                </td>
              </tr>
              <tr>
                <td>Production readiness</td>
                <td className="req">secure, resilient</td>
                <td>
                  Privacy by missing GRANT, prompt injection tested live (nothing leaked;
                  the withheld count moved), notes survive model outages, revoked memory
                  erased by the database&rsquo;s own row-level TTL, follower reads on the
                  million-row timeline.
                </td>
              </tr>
              <tr>
                <td>Real-world impact</td>
                <td className="req">meaningful use case</td>
                <td>
                  Boston renters vs. undocumented housing conditions, with the entire
                  Massachusetts sanitary code retrievable by meaning and cited to the
                  section, plus referrals to legal-aid guides.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="hs-wrap">
          <div className="hs-proof">
            <div>
              <p className="n">191</p>
              <p className="q">tests passing, several against the live cluster and real model calls</p>
            </div>
            <div>
              <p className="n">138–155&nbsp;ms</p>
              <p className="q">consent-filtered vector search over seeded memories</p>
            </div>
            <div>
              <p className="n">87</p>
              <p className="q">Massachusetts housing rules in memory, each linked to its source</p>
            </div>
            <div>
              <p className="n">0</p>
              <p className="q">private items leaked under live prompt-injection attack</p>
            </div>
          </div>
        </div>
      </section>

      <section className="hs-close">
        <div className="hs-wrap">
          <h2>See the receipt for yourself</h2>
          <p className="lede">
            Sign in with just a name, open a case, ask a question. Then open &ldquo;Why do
            I remember this?&rdquo; and read exactly what the agent read.
          </p>
          <a className="hs-btn hs-btn--primary" href="/signin">
            Open the live demo
          </a>
        </div>
      </section>

      <footer>
        <section>
          <div className="hs-wrap">
            <p className="hs-colophon">
              HomeSafe was built for the CockroachDB × AWS hackathon, 2026. Public records
              from the City of Boston&rsquo;s published datasets at{" "}
              <a href="https://data.boston.gov" rel="noopener noreferrer" target="_blank">
                data.boston.gov
              </a>
              ; Massachusetts rules quoted from official sources and marked not yet
              attorney-reviewed; residents in demos are fictional, their buildings and
              records are real. Owner personal data is stripped at ingest. Open source
              under MIT:{" "}
              <a href={REPO_URL} rel="noopener noreferrer" target="_blank">
                github.com/tmoody1973/homesafe
              </a>
              . Database: CockroachDB (drying-gerbil, AWS us-east-2). Models: Claude
              Sonnet 4.5 and Titan v2 on Amazon Bedrock. Evidence for every claim on this
              page lives in docs/evidence/.
            </p>
          </div>
        </section>
      </footer>
    </div>
  );
}

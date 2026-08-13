# 🪳 CockroachDB × AWS Hackathon — Reference

**Prize pool:** $8,750 | **Hackathon page:** [cockroachdb-ai.devpost.com](https://cockroachdb-ai.devpost.com/) | **Resources page:** [cockroachdb-ai.devpost.com/resources](https://cockroachdb-ai.devpost.com/resources)

## Overview

CockroachDB and AWS invite developers, engineers, and AI builders to create the next generation of agentic applications. Harness CockroachDB's distributed AI capabilities, fully managed MCP Server, agent-ready `ccloud` CLI, open-source Agent Skills Repo, LangChain integrations, and Claude/Cursor plugins — all on AWS — to build AI agents with production-grade, persistent memory.

### Why Agentic Memory? Why Now?

AI agents are rapidly moving from experiments into real production workflows — writing code, running pipelines, diagnosing incidents, and driving more application traffic than any human could. The problem: agents need memory that never goes down.

An agent whose memory goes offline doesn't degrade gracefully — it stops. Traditional databases were optimized for human-scale reads and writes. Agentic systems are different: they spawn autonomously, write constantly, and require memory that persists across regions, failures, and scale, with zero data loss and no maintenance windows.

CockroachDB was built for exactly this. It is the system of record for agentic memory: globally distributed, always-on, PostgreSQL-compatible, and now natively integrated into the agent toolchain through MCP, cloud, and an open-source skills ecosystem.

## The Challenge

> Build an agentic application that uses CockroachDB as its persistent memory layer, deployed on AWS.

The agent should store, retrieve, and act on memory — whether that's conversation history, user context, task state, embeddings, or structured transactional data. The best submissions will demonstrate that memory is not an afterthought — it is the thing that makes an agent useful in production.

## Requirements

### CockroachDB tools — use at least TWO

1. **CockroachDB Cloud Managed MCP Server**
   Connect AI agents directly to CockroachDB clusters with a single config snippet from the Cloud Console. Works natively with Claude Code, Cursor, and VS Code. Safe by default: read-only mode, full audit logging, zero custom proxy required.
   Endpoint: `https://cockroachlabs.cloud/mcp`

2. **CockroachDB Distributed Vector Indexing**
   Store and query embeddings at scale using CockroachDB's vector support with distributed indexing. Semantic search and retrieval stay fast as data grows — no separate vector store to maintain, no reindexing pain, no consistency gaps between vector data and the operational database. Ideal for RAG pipelines, long-term agent memory, and semantic search applications.

3. **`ccloud` CLI (Agent-Ready)**
   Gives an agent direct, secure access to the full CockroachDB Cloud control plane: provision clusters, manage backups, configure networking, monitor audit logs — all from the terminal. Designed for AI with consistent noun-verb patterns, JSON output on every command, and granular service-account-based RBAC.

4. **CockroachDB Agent Skills Repo (Open Source)**
   A curated, open-source collection of machine-executable Agent Skills encoding CockroachDB expertise. Spans onboarding, query/schema design, operations, performance, security, and observability. Portable across Claude, Cursor, LangChain, and any MCP-compatible client.

### AWS services — use at least ONE

- Amazon Bedrock (foundation models, knowledge bases, or agents)
- AWS Lambda (serverless agent execution)
- Amazon ECS / EKS (containerized agent workloads)
- Amazon S3 (artifact or document storage)
- Amazon SageMaker (model training or inference)
- Amazon Bedrock Agents (multi-step agentic workflows)
- Any other AWS service that powers the agent's environment

## What to Submit

- **Public open-source code repo URL** — must contain all source code, a clear README, dependencies, example configs/datasets (if applicable), and setup + run instructions for the project to be functional.
- **Open-source license required** — MIT or Apache 2.0 recommended. Must be detectable/visible at the top of the repo page (in the "About" section).
- **Functional demo app URL.**
- **Demo video (< 3 minutes)** — uploaded to YouTube or Vimeo, made public, demonstrating the submission and the CockroachDB memory layer at work.
- **Identify CockroachDB tools used** (MCP Server, ccloud CLI, Distributed Vector Indexing, Agent Skills) and explain what the agent actually did with them.
- **Identify AWS services used** (Bedrock, Lambda, S3, etc.) and explain how.
- *Optional:* architectural diagram showing how CockroachDB, AWS services, and the agent interact.
- *Optional:* feedback on CockroachDB's AI tools/features.

## Judging Criteria

| Criterion | What judges look for |
|---|---|
| **Agentic Memory Design** | Does CockroachDB play a meaningful, production-grade role as the agent's memory layer? Is it used for more than toy queries — state, embeddings, context, or transactional data at real scale? |
| **Technical Implementation** | Is the integration with CockroachDB tools (distributed vector index, MCP Server, ccloud CLI) quality software engineering? Does the agent use the tools correctly and safely? |
| **Real-World Impact** | How big of an impact could the project have on real users or workflows? Is the use case meaningful, not just technically impressive? |
| **Production Readiness** | Is the design secure, observable, and scalable? Has the team thought about resilience, access control, and what happens when things go wrong? |
| **Creativity & Originality** | Is this a genuinely new idea or a novel application of the technology? Does it demonstrate insight into what makes agentic systems different from traditional apps? |

## Prizes

| Place | Cash | Extras |
|---|---|---|
| 1st | $5,000 | Blog feature + Cockroach Labs swag |
| 2nd | $2,500 | Cockroach Labs swag |
| 3rd | $1,250 | Cockroach Labs swag |

## Resources

- Hackathon home: [cockroachdb-ai.devpost.com](https://cockroachdb-ai.devpost.com/)
- Resources page: [cockroachdb-ai.devpost.com/resources](https://cockroachdb-ai.devpost.com/resources)
- CockroachDB Cloud (free tier, no credit card required): [cockroachlabs.cloud](https://cockroachlabs.cloud)
- Managed MCP Server endpoint: `https://cockroachlabs.cloud/mcp` — get the config snippet from Cloud Console (select cluster → copy MCP config → paste into Claude Code, Cursor, or VS Code)
- ccloud CLI documentation — via Cloud Console; install, authenticate with a service account, drive infra from the terminal
- CockroachDB Agent Skills Repo — open-source, machine-executable skills on GitHub (onboarding, ops, performance, security, observability)
- pgvector + CockroachDB (Distributed Vector Search) — integrated vector indexing for semantic search/RAG at scale
- LangChain × CockroachDB — Provider, Vector Store, and Chat Message History integrations
- AWS Free Tier — hands-on AWS access at no cost
- Cockroach Labs Slack — support/community channel (join link on the resources page)

### FAQ highlights (from resources page)

- **Free to use?** Yes — CockroachDB Cloud's free tier is fully eligible for the hackathon; no credit card required; a cluster can be spun up in minutes.
- **Other AI models besides Claude?** Yes — the MCP Server supports any MCP-compatible client; the Agent Skills Repo is model-agnostic (works with Claude, Cursor, LangChain, or your own agent framework). At least one AWS service is still required.
- **New to CockroachDB?** Starter kits are designed to get you from zero to a running agent in under 30 minutes. CockroachDB is fully PostgreSQL-compatible — if you know Postgres, you already know most of it.
- **Vector store + transactional store together?** Yes — this is a key differentiator: CockroachDB has integrated pgvector support with distributed indexing, so embeddings and transactional data live in one system, eliminating ETL complexity and consistency gaps between a separate vector store and the operational database.
- **What is MCP?** An open standard created by Anthropic that lets AI agents safely and predictably interact with external systems (tools, databases, APIs) through a structured, auditable interface. CockroachDB's Managed MCP Server implements MCP, giving agents like Claude Code and Cursor a direct, secure connection to a database cluster.
- **What are Agent Skills?** Structured, machine-executable capabilities published in CockroachDB's open-source skills repo. Each encodes a specific CockroachDB workflow (e.g., "profile statement fingerprints," "detect schema anti-patterns") with clear inputs/outputs/behavior, following open standard interfaces so they work across models and agent frameworks without rewriting integrations.

## Notes for Project Ideas

Given my focus on civic tech (Gavel, event discovery, voter guide), potential angles worth exploring:
- An agent with persistent memory across Milwaukee civic data (meeting minutes, council actions, event history) using CockroachDB as the memory + vector store, deployed via AWS Lambda or Bedrock Agents.
- A RAG-based assistant over government documents stored in S3, with CockroachDB's distributed vector index for retrieval and MCP Server for safe, audited agent access to the data.

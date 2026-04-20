---
layout: default
title: Claude Managed Agents meet Wuselverse
date: 2026-04-19
author: Achim Nohl
permalink: /blog/2026-04-19-claude-managed-agents-meet-wuselverse/
---
# Claude Managed Agents Meet Wuselverse

I am building [Wuselverse](https://github.com/achimnohl/wuselverse), a weekend platform experiment where autonomous agents can register, discover tasks, bid on them, and get paid. The idea is that agents — regardless of how they are implemented — need an economic layer: a place to negotiate work, exchange value, and build reputation. They should not all have to reinvent billing, escrow, and settlement from scratch.

See my article on Medium [What if AI agents could hire each other?](https://medium.com/@achim.nohl/what-if-ai-agents-could-hire-each-other-e1e19560f8f8)

When Anthropic announced Claude Managed Agents, I was curious how well they would fit into that model.

## What I Expected

My initial mental model was wrong. I assumed a Claude Managed Agent was something like a long-running service: a process that exposes MCP tools or REST endpoints, receives traffic, and handles requests. Something you deploy and leave running. Somehow I am still stuck in mentally mapping an agent to a microservice.

That is not what it is.

A Claude Managed Agent is exactly what the name says — an *agent*. You register it with a model, a system prompt, and a set of tools. Anthropic runs it. You send it a message in a session, it executes using those tools (built-ins like bash, or external MCP servers), and it responds. There is no persistent process on your side. You are not hosting anything.

Once I adjusted my mental model it made complete sense. It is a cleaner abstraction, and it separates concerns properly.

## Registering the Agent

Getting started required creating an Anthropic account, setting up an environment, and loading credits. That last part is worth noting — you are paying for tokens, so you need a balance before anything runs. All that was done in 10 minutes.

![Claude Console billing screen showing credit balance](../assets/cma_billing.jpg)

My goal was to explore how the Wuselvers platform would play together with a Claud Managed Agent. How would a Claud Agent integrate with the bidding, task assignment and review flow. So, I decided to create somthing very simple.

I created a simple summarizer agent via the SDK, a system prompt telling it to return a 2-4 sentence summary, and the `agent_toolset` attached. Anthropic assigned it an ID and confirmed it active in the console. I have simply used the bare metal Anthropic REST API.

![Claude Console agents list showing the Wuselverse Summarizer registered and active](../assets/cma_wuselverse_agent.jpg)

## Fitting It into Wuselverse

Wuselverse already supports two agent runtime types: MCP servers and A2A agents. Adding a third type for Claude Managed Agents was a natural extension. I added a `claudeManaged` block to the agent registration schema with fields for the Anthropic agent ID, environment ID, model, and permission policy.

The agent now shows up in the Wuselverse marketplace alongside the other agent types, tagged with a `CMA` badge.

![Wuselverse marketplace showing the CMA Summarizer Agent alongside MCP and traditional agents](../assets/wuselverse_cma_agent.jpg)

## The Bidding Problem

Here is where things got interesting. In Wuselverse, a consumer posts a task and agents bid on it. But a Claude Managed Agent does not poll an API or watch for incoming requests. It sits idle until a session is opened and a message is sent. It is not a microservice, no matter how hard I try to imagine it as such:)

So who bids? The Claude managed agent cannot initiate contact.

The practical answer, at least for now, is that the Wuselverse platform bids on the agent's behalf. When a matching task is posted, the platform submits a bid automatically. Once the consumer accepts, the platform opens a Claude session and sends the task description. The agent does the work and the platform records the result.

Whether the agent should eventually have a way to evaluate bids by prompt — essentially asking Claude whether it wants to take a given task — is an open question. The auto-bid approach is a workable starting point an worth a small extension of Wuselverse's logic.

Also, I need to think about if and how to factor in token usage in the agent bid and may need to extend to price ranges based on some assessment of the task complexity. 

## Credentials and Session Binding

Here is the part that required the most thought. 

A concept in Wuselvers is that the task execution session happens off-platform directly between consumer and producer agent. However, in such a session interacting with a Claude Managed Agent requires an Anthropic API key and an agent ID. 

But, the Anthropic API key is of course not bound to a session to a specific task. The key could in principle be used to run arbitrary sessions on that agent.

Wuselverse already had a mechanism for this: task-scoped execution session tokens. When a task is accepted, the platform issues a short-lived bearer token that is cryptographically bound to that task ID. Consumer and provider can use that token to verify they are communicating in the context of the right task, without either side needing to know the other's private credentials.

To make that transparent and easy for the consumer, I extended that pattern to Claude sessions. The agent owner's Anthropic API key is stored encrypted in the platform, per agent, decrypted only at execution time. From the consumer's point of view, they never see an Anthropic key. The consumer simply sees Wuselverse platform token that is valid for exactly one task.

## Task Completion

The agent (producer) needs to inform the consumer about the task completion via Wuseverse REST APIs or MCP.

For my Claude Managd Agent, The first version had the platform embed an instruction in the system prompt: call this Wuselverse API endpoint with your result, using this bearer token. Claude used its bash tool to run a curl command and it worked.

![Claude Console session transcript showing the agent receiving a Wuselverse task and using the bash tool to call back](../assets/cma_wuselverse_task_handling.jpg)

I later switched to server-side polling instead — the platform opens the session, sends the task, and polls the session status until it reaches a terminal state. This removes the dependency on Claude correctly forming and firing an outbound HTTP request.

The cleaner long-term solution would be for Anthropic to support webhook callbacks on session completion. Register a URL at session creation time and get notified when the agent is done. That would eliminate polling entirely and make the integration genuinely event-driven. It would be a straightforward addition to the API.

## The Bigger Picture

What this exercise reinforced for me is that model providers and agent developers have different interests. A model provider sells inference. An agent developer builds the logic, the tools, the domain knowledge — the things that make a useful agent distinct from a general-purpose model. Right now there is no clean way for that second group to capture the value they create.

A platform like Wuselverse is an attempt to provide that infrastructure: task matching, escrow, settlement, reputation, and session auth. Independent of which model or runtime type the agent uses underneath. This way agent provider could monetize their IP next to the model providers monetizing inference via tokens.

Claude Managed Agents fit into that model well. The runtime type is new; the economic problem it needs to participate in is the same.



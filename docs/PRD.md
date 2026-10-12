# Dreamforge PRD

Dreamforge helps teachers guide students from an idea to a working app, while retaining visibility into every prompt. The MVP targets grades 6–12 and adopts imagi’s dark workspace, cyan navigation and pink active states with original branding.

## Core experience

1. Teacher creates a classroom and adds unique student aliases.
2. Student joins using a classroom code and issued credential.
3. Teacher assigns a course and a building credit budget.
4. Student creates an AI app, sends a prompt, previews and iterates.
5. Teacher reviews prompts, moderation results and project progress.

## MVP requirements

| Area | Required behavior |
| --- | --- |
| Dashboard | Onboarding checklist and AI/Python entry points |
| Projects | Create, search, resume; separate AI and Python tabs |
| Curriculum | Browse courses, view lessons, assign to classrooms |
| Classrooms | Bulk alias creation, join codes, membership, budgets |
| Studio | Prompt history, build status, preview, retry and reflection |
| Safety Monitor | Timestamped prompt feed; classroom filters; blocked prompt explanations |

All prompts must be recorded before generation. Blocked prompts must never reach the builder. Teachers see only their classrooms; students see only their own work. Failed builds retain prompts and allow retry without duplicate charges.

## Success and scope

Measure classroom activation, first successful build, lesson completion, build success rate and teacher review usage. Pilot targets: first build within 10 minutes; all submitted prompts auditable; no cross-classroom access.

The scaffold implements local educator flows, project persistence, course assignment and prompt review. AI output is a fixed sample; Python is a static pixel preview. Production authentication, moderation, real generation, credits, hardware and publishing remain outside the scaffold.

## Reference evidence

Observed in the signed-in [imagi Edu](https://edu.imagilabs.com/) account on 10 October 2026. See [experience map](EXPERIENCE-MAP.md). Lovable creation was unavailable for this account’s district; the studio workflow above is a proposed design.

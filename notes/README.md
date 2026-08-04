# Dev3 Notes

This directory is the repository-local record of implemented changes, planned
features, and lasting engineering decisions.

Notion companions:

- [Dev3 Engineering Notes](https://app.notion.com/p/3a65615a45578113b272cfb82c0ff235)
- [Dev3 tasks](https://app.notion.com/p/3a55615a455780f385c6f7388200365e)

## Structure

- `updates/`: completed implementation work and releases
- `features/`: proposed or approved work that is not yet complete
- `decisions/`: technical decisions that future work must preserve

## Rules

1. Search this directory and Notion before creating a record.
2. Use one `YYYY-MM-DD-topic.md` file per topic.
3. State only verified outcomes; include affected areas, validation, and known
   limitations.
4. Feature notes must include implementation steps, acceptance criteria,
   security or reliability constraints, validation, and out-of-scope boundaries.
5. Mirror updates and decisions to Dev3 Engineering Notes. Create or update
   feature work in Dev3 tasks.
6. Never include credentials, tokens, private customer data, or secret values.

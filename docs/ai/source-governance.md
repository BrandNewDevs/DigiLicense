# Source governance

Only promoted, bundled corpus releases are retrievable. Runtime web search, scraping, user uploads,
and arbitrary files are prohibited.

Every source has a stable source ID, section IDs, neutral metadata, publisher, jurisdiction, public
URL, publication/retrieval dates, reviewer status, corpus version, and SHA-256 checksum. Each intent
has an explicit source allowlist. Critical numeric values are duplicated in fact packets so output
validation can reject unsupported dates, durations, and amounts.

Promotion flow:

```text
collected -> reviewed -> structured -> checksummed -> evaluated -> promoted
```

Rollback selects a previously validated release from the in-memory registry; an unvalidated release
cannot become active. Prototype behavior is stored separately from public policy and must be disclosed
in answers.

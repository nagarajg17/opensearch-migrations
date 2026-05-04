# SolrCloud Shim Validation Report

**Date:** 2026-05-04
**Setup:** SolrCloud (Solr 8 + ZooKeeper 3.8) → OpenSearch 3.3.0 via Transformation Shim
**Schema:** All fields (`name`, `category`, `price`, `in_stock`) defined as `text_general` (Solr) / `text` (OpenSearch), single-valued.
**Data:** 5 documents seeded identically in both backends.

## Summary

| Query Type | Doc Count Match | Doc Content Match | Notes |
|---|---|---|---|
| Match all (`*:*`) | ✅ | ✅ | Only `_version_` and `zkConnected` differ |
| Field term (`category:software`) | ✅ | ✅ | 3 docs returned by both |
| Field text (`name:opensearch`) | ✅ | ✅ | 1 doc returned by both |
| Boolean AND (`category:books AND in_stock:true`) | ✅ | ✅ | 1 doc returned by both |
| OR query (`category:books OR category:software`) | ✅ | ✅ | 5 docs, same order |
| Pagination (`rows=2&start=0`) | ✅ | ✅ | 2 docs returned, `numFound=5` |
| Field list (`fl=id,name`) | ✅ | ⚠️ | Shim includes extra `_version_` field not in Solr response |
| Sort (`sort=name asc`) | ❌ | ❌ | OpenSearch rejects sort on `text` fields (needs `keyword` or `fielddata=true`) |


## What's the Same

- **Document data**: All user fields (`id`, `name`, `category`, `price`, `in_stock`) return identical values when queries match.
- **Response structure**: The shim correctly produces Solr-format responses (`responseHeader`, `response.docs[]`, `numFound`, `start`, `numFoundExact`).
- **Field-scoped queries**: `field:value` queries with exact terms, boolean AND/OR, and pagination all produce matching results.
- **Doc counts**: For supported query types, both backends return the same number of documents.
- **Doc ordering**: For queries without explicit sort, document order is consistent.

## What's Different

### Expected / Cosmetic Differences (all queries)

| Field | Solr | OpenSearch (via shim) | Impact |
|---|---|---|---|
| `responseHeader.zkConnected` | `true` | absent | SolrCloud-only metadata, not meaningful for OpenSearch |
| `_version_` | large positive long (e.g. `1864261698098036736`) | `0` | Internal versioning, different systems |
| `responseHeader.QTime` | varies | always `0` | Shim synthesizes header, doesn't measure OpenSearch latency |

### Functional Differences

#### 1. Sort on `text` fields — ❌ FAIL
**Query:** `q=*:*&sort=name asc`
- **Solr**: Sorts successfully on `text_general` fields.
- **OpenSearch**: Returns 400 error — `text` fields cannot be sorted without `fielddata=true` or a `.keyword` sub-field.
- **Fix**: Map Solr `text_general` to OpenSearch `text` with a `keyword` sub-field, or use the transform to append `.keyword` to sort fields.

#### 2. Field list (`fl`) — ⚠️ MINOR
**Query:** `q=*:*&fl=id,name`
- **Solr**: Returns only `id` and `name`.
- **OpenSearch (via shim)**: Returns `id`, `name`, and `_version_` (extra field).
- **Fix**: The `hits-to-docs` response transform always appends `_version_`. It should respect the `fl` parameter and omit `_version_` when not requested.

## Ports Reference

| Port | Service | Behavior |
|---|---|---|
| 8983 | Solr Cloud (direct) | Native Solr responses |
| 9200 | OpenSearch (direct) | Native OpenSearch responses |
| 8081 | shim-solr-only | Passthrough to Solr, no transforms |
| 8082 | shim-opensearch-only | Transforms Solr→OpenSearch queries, returns Solr-format response |
| 8083 | shim-solr-primary | Dual-target: returns Solr response, validates against OpenSearch |
| 8084 | shim-opensearch-primary | Dual-target: returns OpenSearch response, validates against Solr |

# Transformation Shim - Development Setup Guide

## Prerequisites
- Java 17
- Docker
- docker-compose (`sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose`)

---

## Quick Start (Recommended)

The easiest way to run with transforms is using Docker Compose:

```bash
cd /home/narajg/OpenSource/opensearch-migrations

# Build the shim Docker image
./gradlew :TrafficCapture:transformationShim:jibDockerBuild

# Start all services
cd TrafficCapture/SolrTransformations/docker
docker-compose -f docker-compose.validation.yml up -d
```

### Running Services

| Port | Service | Description |
|------|---------|-------------|
| 8983 | Solr | Direct Solr access |
| 9200 | OpenSearch | Direct OpenSearch access |
| 8081 | shim-solr-only | Passthrough to Solr (no transforms) |
| **8082** | **shim-opensearch-only** | **Transforms Solr→OpenSearch queries** |
| **8083** | **shim-solr-primary** | **Dual-target with validation** |
| 8084 | shim-opensearch-primary | Dual-target, OpenSearch primary |

### Stop All Services

```bash
cd /home/narajg/OpenSource/opensearch-migrations/TrafficCapture/SolrTransformations/docker
docker-compose -f docker-compose.validation.yml down
```

### View Logs

```bash
docker-compose -f docker-compose.validation.yml logs -f shim-opensearch-only
```

---

## Test the Setup

### 1. Create test data in Solr

```bash
# Create collection
docker exec docker-solr-1 solr create_core -c products

# Add documents
curl -X POST "http://localhost:8983/solr/products/update?commit=true" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "1", "name": "OpenSearch Migrations", "category": "software"},
    {"id": "2", "name": "Apache Solr", "category": "software"}
  ]'
```

### 2. Create matching index in OpenSearch

```bash
curl -X PUT "http://localhost:9200/products" -H "Content-Type: application/json" -d '{
  "mappings": {"properties": {"name": {"type": "text"}, "category": {"type": "keyword"}}}
}'

curl -X POST "http://localhost:9200/products/_bulk" -H "Content-Type: application/json" -d '
{"index":{"_id":"1"}}
{"name":"OpenSearch Migrations","category":"software"}
{"index":{"_id":"2"}}
{"name":"Apache Solr","category":"software"}
'
```

### 3. Test queries

```bash
# Direct to Solr
curl "http://localhost:8983/solr/products/select?q=*:*"

# Via shim passthrough (no transform)
curl "http://localhost:8081/solr/products/select?q=*:*"

# Via shim WITH TRANSFORM (Solr query → OpenSearch)
curl "http://localhost:8082/solr/products/select?q=*:*"

# Dual-target with validation headers
curl -v "http://localhost:8083/solr/products/select?q=*:*" 2>&1 | grep "X-Validation"
```

---

## What the Transforms Do

```
Client Request (Solr format)
    │
    ▼
┌─────────────────────────────────────┐
│ REQUEST TRANSFORM                   │
│                                     │
│ /solr/products/select?q=name:foo    │
│         ↓                           │
│ POST /products/_search              │
│ {"query":{"term":{"name":"foo"}}}   │
└─────────────────────────────────────┘
    │
    ▼
   OpenSearch
    │
    ▼
┌─────────────────────────────────────┐
│ RESPONSE TRANSFORM                  │
│                                     │
│ {"hits":{"hits":[...]}}             │
│         ↓                           │
│ {"response":{"docs":[...]}}         │
└─────────────────────────────────────┘
    │
    ▼
Client Response (Solr format)
```

---

## Transform Source Code

```
TrafficCapture/SolrTransformations/transforms/src/solr-to-opensearch/
├── request.transform.ts      # Entry point for request transforms
├── response.transform.ts     # Entry point for response transforms
├── context.ts                # Parses request/response context
├── pipeline.ts               # Runs transform pipeline
├── registry.ts               # Registers micro-transforms
└── features/
    ├── select-uri.ts         # /solr/X/select → /X/_search
    ├── query-q.ts            # q=*:* → {"query":{"match_all":{}}}
    ├── hits-to-docs.ts       # OpenSearch hits → Solr docs
    └── response-header.ts    # Adds Solr responseHeader
```

### Modifying Transforms

1. Edit TypeScript files in `transforms/src/`
2. The `transform-watcher` container auto-rebuilds on save
3. Changes take effect immediately (hot-reload)

---

## Alternative: Run Shim Locally (without Docker)

For development without transforms:

```bash
cd /home/narajg/OpenSource/opensearch-migrations

# Start Solr/OpenSearch in Docker
docker run -d --name solr -p 8983:8983 mirror.gcr.io/library/solr:8 solr-precreate demo
docker run -d --name opensearch -p 9200:9200 -e "discovery.type=single-node" -e "DISABLE_SECURITY_PLUGIN=true" mirror.gcr.io/opensearchproject/opensearch:2.15.0

# Run shim locally
./gradlew :TrafficCapture:transformationShim:run --args='--listenPort 8080 --target solr=http://localhost:8983 --primary solr'
```

---

## CLI Reference

```
--listenPort PORT        Port for shim to listen on (required)
--target NAME=URI        Backend target (repeatable)
--primary NAME           Which target's response to return
--targetTransform NAME=request:file.js,response:file.js
--validator SPEC         Validation rules (repeatable)
--watchTransforms        Hot-reload transform files
--insecureBackend        Trust all backend TLS certs
--timeout MS             Secondary target timeout (default: 30000)
```

### Validator Formats
```
field-equality:targetA,targetB:ignore=path1,path2
doc-count:targetA,targetB:assert=a<=b
doc-ids:targetA,targetB[:ordered]
js:targetA,targetB:script=file.js
```

---

## Building

```bash
# Build project
./gradlew :TrafficCapture:transformationShim:build

# Build Docker image
./gradlew :TrafficCapture:transformationShim:jibDockerBuild

# Run tests
./gradlew :TrafficCapture:transformationShim:test
```

---

## Troubleshooting

### Check container status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### View shim logs
```bash
docker-compose -f docker-compose.validation.yml logs shim-opensearch-only
```

### Restart a specific service
```bash
docker-compose -f docker-compose.validation.yml restart shim-opensearch-only
```

### Clean restart
```bash
docker-compose -f docker-compose.validation.yml down -v
docker-compose -f docker-compose.validation.yml up -d
```

---

## Docker Commands Reference

### Container Management
```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Stop a container
docker stop <container_name>

# Start a stopped container
docker start <container_name>

# Remove a container
docker rm <container_name>

# Stop and remove a container
docker rm -f <container_name>
```

### Docker Compose Commands
```bash
# Start services in background
docker-compose -f docker-compose.validation.yml up -d

# Start services in foreground (see logs)
docker-compose -f docker-compose.validation.yml up

# Stop services (keeps containers)
docker-compose -f docker-compose.validation.yml stop

# Stop and remove containers
docker-compose -f docker-compose.validation.yml down

# Stop, remove containers AND volumes (full cleanup)
docker-compose -f docker-compose.validation.yml down -v

# Restart all services
docker-compose -f docker-compose.validation.yml restart

# Restart specific service
docker-compose -f docker-compose.validation.yml restart shim-opensearch-only

# View logs (all services)
docker-compose -f docker-compose.validation.yml logs

# View logs (follow mode)
docker-compose -f docker-compose.validation.yml logs -f

# View logs (specific service)
docker-compose -f docker-compose.validation.yml logs -f shim-opensearch-only

# Check service status
docker-compose -f docker-compose.validation.yml ps
```

### Execute Commands in Containers
```bash
# Run command in Solr container
docker exec docker-solr-1 solr create_core -c mycore

# Open shell in container
docker exec -it docker-solr-1 /bin/bash

# Check OpenSearch health
docker exec docker-opensearch-1 curl -s localhost:9200/_cluster/health
```

### Image Management
```bash
# List images
docker images

# Remove an image
docker rmi <image_name>

# Build shim image
./gradlew :TrafficCapture:transformationShim:jibDockerBuild
```

### Network & Cleanup
```bash
# List networks
docker network ls

# Remove unused resources
docker system prune

# Remove all stopped containers, unused networks, dangling images
docker system prune -a
```

# Automated Transformation Shim Setup

This guide provides step-by-step commands to set up the OpenSearch Migrations transformation shim from scratch. All commands can be executed by an AI agent or developer.

---

## Prerequisites Check

Verify prerequisites are installed:

```bash
# Check Java 17
java -version

# Check Docker
docker --version

# Check docker-compose
docker-compose --version
```

If docker-compose is missing, install it:
```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

---

## Step 1: Clone Repository

```bash
# Create directory structure
mkdir -p ~/OpenSource
cd ~/OpenSource

# Clone the repository
git clone https://github.com/opensearch-project/opensearch-migrations.git

# Navigate to project root
cd opensearch-migrations
```

---

## Step 2: Build Transformation Shim Docker Image

```bash
cd ~/OpenSource/opensearch-migrations

# Build the shim Docker image using Gradle
./gradlew :TrafficCapture:transformationShim:jibDockerBuild
```

**Expected output:** Docker image `migrations/transformation_shim:latest` created

---

## Step 3: Start All Services with Docker Compose

```bash
# Navigate to docker compose directory
cd ~/OpenSource/opensearch-migrations/TrafficCapture/SolrTransformations/docker

# Start all services in detached mode
docker-compose -f docker-compose.validation.yml up -d
```

**Services started:**
- Solr (port 8983)
- OpenSearch (port 9200)
- shim-solr-only (port 8081)
- shim-opensearch-only (port 8082) - **Main transformation endpoint**
- shim-solr-primary (port 8083)
- shim-opensearch-primary (port 8084)

---

## Step 4: Verify Services Are Running

```bash
# Check all containers are running
docker-compose -f docker-compose.validation.yml ps

# Alternative: Check all running containers
docker ps
```

**Expected:** All services should show "Up" status

---

## Step 5: Create Test Data in Solr

```bash
# Wait for Solr to be ready (may take 10-30 seconds)
sleep 15

# Create a collection named 'products'
docker exec docker-solr-1 solr create_core -c products

# Add sample documents
curl -X POST "http://localhost:8983/solr/products/update?commit=true" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "1", "name": "OpenSearch Migrations", "category": "software"},
    {"id": "2", "name": "Apache Solr", "category": "software"},
    {"id": "3", "name": "Elasticsearch", "category": "software"}
  ]'
```

---

## Step 6: Create Matching Index in OpenSearch

```bash
# Create index with mappings
curl -X PUT "http://localhost:9200/products" \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": {
      "properties": {
        "name": {"type": "text"},
        "category": {"type": "keyword"}
      }
    }
  }'

# Add sample documents
curl -X POST "http://localhost:9200/products/_bulk" \
  -H "Content-Type: application/json" \
  -d '
{"index":{"_id":"1"}}
{"name":"OpenSearch Migrations","category":"software"}
{"index":{"_id":"2"}}
{"name":"Apache Solr","category":"software"}
{"index":{"_id":"3"}}
{"name":"Elasticsearch","category":"software"}
'

# Refresh index to make documents searchable
curl -X POST "http://localhost:9200/products/_refresh"
```

---

## Step 7: Test Transformation Queries

```bash
# Test 1: Direct Solr query (baseline)
echo "=== Direct Solr Query ==="
curl -s "http://localhost:8983/solr/products/select?q=*:*&rows=10" | jq .

# Test 2: Query through transformation shim (Solr → OpenSearch)
echo -e "\n=== Transformed Query (Solr format → OpenSearch → Solr format) ==="
curl -s "http://localhost:8082/solr/products/select?q=*:*&rows=10" | jq .

# Test 3: Search for specific term
echo -e "\n=== Search for 'OpenSearch' ==="
curl -s "http://localhost:8082/solr/products/select?q=name:OpenSearch" | jq .

# Test 4: Dual-target with validation
echo -e "\n=== Dual-target validation (check headers) ==="
curl -v "http://localhost:8083/solr/products/select?q=*:*" 2>&1 | grep -E "X-Validation|HTTP/"
```

---

## Step 8: View Logs (Optional)

```bash
# View all service logs
docker-compose -f docker-compose.validation.yml logs

# View specific shim logs
docker-compose -f docker-compose.validation.yml logs -f shim-opensearch-only

# View last 50 lines
docker-compose -f docker-compose.validation.yml logs --tail=50
```

---

## Complete Setup Verification

Run this command to verify everything is working:

```bash
# Test transformation endpoint
RESPONSE=$(curl -s "http://localhost:8082/solr/products/select?q=*:*")
NUM_FOUND=$(echo $RESPONSE | jq -r '.response.numFound')

if [ "$NUM_FOUND" -eq "3" ]; then
  echo "✓ Setup successful! Found $NUM_FOUND documents through transformation shim."
else
  echo "✗ Setup issue: Expected 3 documents, found $NUM_FOUND"
fi
```

---

## Cleanup Commands

```bash
# Stop all services
cd ~/OpenSource/opensearch-migrations/TrafficCapture/SolrTransformations/docker
docker-compose -f docker-compose.validation.yml down

# Stop and remove volumes (full cleanup)
docker-compose -f docker-compose.validation.yml down -v

# Remove Docker images (optional)
docker rmi migrations/transformation_shim:latest
```

---

## Troubleshooting

### Services won't start
```bash
# Check if ports are already in use
netstat -tuln | grep -E '8983|9200|808[1-4]'

# View error logs
docker-compose -f docker-compose.validation.yml logs
```

### Transformation not working
```bash
# Restart shim service
docker-compose -f docker-compose.validation.yml restart shim-opensearch-only

# Check shim logs for errors
docker-compose -f docker-compose.validation.yml logs shim-opensearch-only
```

### Build failures
```bash
# Clean and rebuild
cd ~/OpenSource/opensearch-migrations
./gradlew clean
./gradlew :TrafficCapture:transformationShim:jibDockerBuild
```

---

## Quick Reference

| Port | Service | Purpose |
|------|---------|---------|
| 8983 | Solr | Direct Solr access |
| 9200 | OpenSearch | Direct OpenSearch access |
| 8081 | shim-solr-only | Passthrough (no transform) |
| **8082** | **shim-opensearch-only** | **Solr→OpenSearch transforms** |
| 8083 | shim-solr-primary | Dual-target validation |
| 8084 | shim-opensearch-primary | OpenSearch primary |

---

## One-Command Setup Script

For fully automated setup, run:

```bash
cd ~/OpenSource/opensearch-migrations && \
./gradlew :TrafficCapture:transformationShim:jibDockerBuild && \
cd TrafficCapture/SolrTransformations/docker && \
docker-compose -f docker-compose.validation.yml up -d && \
sleep 15 && \
docker exec docker-solr-1 solr create_core -c products && \
curl -X POST "http://localhost:8983/solr/products/update?commit=true" -H "Content-Type: application/json" -d '[{"id":"1","name":"OpenSearch Migrations","category":"software"},{"id":"2","name":"Apache Solr","category":"software"},{"id":"3","name":"Elasticsearch","category":"software"}]' && \
curl -X PUT "http://localhost:9200/products" -H "Content-Type: application/json" -d '{"mappings":{"properties":{"name":{"type":"text"},"category":{"type":"keyword"}}}}' && \
curl -X POST "http://localhost:9200/products/_bulk" -H "Content-Type: application/json" -d '{"index":{"_id":"1"}}
{"name":"OpenSearch Migrations","category":"software"}
{"index":{"_id":"2"}}
{"name":"Apache Solr","category":"software"}
{"index":{"_id":"3"}}
{"name":"Elasticsearch","category":"software"}
' && \
curl -X POST "http://localhost:9200/products/_refresh" && \
echo -e "\n✓ Setup complete! Test with: curl http://localhost:8082/solr/products/select?q=*:*"
```

---

## AI Agent Instructions

When given this document, an AI agent should:

1. Execute commands sequentially from Step 1 through Step 7
2. Verify each step completes successfully before proceeding
3. If any step fails, check the troubleshooting section
4. Run the verification command in Step 8 to confirm setup
5. Report the final status to the user

**Success criteria:** The verification command returns `numFound: 3` when querying through port 8082.

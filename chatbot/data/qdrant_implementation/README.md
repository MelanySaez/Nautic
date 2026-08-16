# Qdrant Text Indexer

A comprehensive text indexing and search system built with Qdrant vector database. This implementation provides document chunking, storage, and search capabilities with support for both text-based and vector-based search.

## 🚀 Features

- **Document Chunking**: Automatically splits large documents into 30k character chunks
- **Project Organization**: Group documents by projects with filtering capabilities  
- **Text Storage**: Store document content in Qdrant payloads
- **Vector Ready**: Pre-configured for 1536-dimensional embeddings (text-embedding-3-small)
- **Flexible Search**: Text-based search with vector search capabilities
- **CRUD Operations**: Create, read, update, and delete documents
- **Collection Management**: Easy collection creation and configuration
- **Docker Support**: Simple Docker-based Qdrant deployment

## 📁 Project Structure

```
qdrant_implementation/
├── create_text_index.py      # Main QdrantTextIndexer class
├── bulk_update_delete.py     # Demo script with examples
├── setup_qdrant.py          # Setup and installation script
├── requirements.txt         # Python dependencies
└── README.md               # This file
```

## 🔧 Quick Start

### 1. Setup Qdrant

Run the automated setup script:

```bash
python setup_qdrant.py
```

This will:
- Check for Docker installation
- Install Python requirements
- Start Qdrant in Docker container
- Create and test a collection
- Verify the setup

### 2. Manual Setup (Alternative)

If you prefer manual setup:

```bash
# Install requirements
pip install -r requirements.txt

# Start Qdrant with Docker
docker run -d \
    --name qdrant-text-indexer \
    -p 6333:6333 \
    -p 6334:6334 \
    -v qdrant_storage:/qdrant/storage:z \
    qdrant/qdrant:latest

# Wait for Qdrant to start, then test
python -c "from create_text_index import QdrantTextIndexer; QdrantTextIndexer().create_collection()"
```

### 3. Run Demo

Execute the comprehensive demo:

```bash
python bulk_update_delete.py
```

## 📖 Usage Examples

### Basic Usage

```python
from create_text_index import QdrantTextIndexer

# Initialize indexer
indexer = QdrantTextIndexer(
    qdrant_host="localhost",
    qdrant_port=6333,
    collection_name="my_documents",
    vector_size=1536
)

# Create collection
indexer.create_collection()

# Index a document
success = indexer.index_text_document(
    text_content="Your document content here...",
    project_id="project_001",
    project_name="My Project",
    document_name="Document 1",
    file_path="/path/to/doc.txt"
)

# Search documents
results = indexer.search_by_text(
    query_text="search terms",
    project_id="project_001",  # Optional: filter by project
    limit=10
)

# Print results
for hit in results:
    print(f"Score: {hit['_score']}")
    print(f"Document: {hit['_source']['document_name']}")
    print(f"Text: {hit['_source']['text_content'][:200]}...")
```

### Advanced Features

```python
# Get collection information
info = indexer.get_collection_info()
print(f"Total points: {info['points_count']}")

# Delete a document (all chunks)
indexer.delete_document("document_id_here")

# Search with vector (when embeddings are available)
vector = [0.1, 0.2, 0.3, ...]  # Your embedding vector
results = indexer.search_by_vector(
    query_vector=vector,
    project_id="project_001",
    limit=5,
    score_threshold=0.8
)
```

## 🏗️ Architecture

### QdrantTextIndexer Class

The main class that handles all operations:

- **Collection Management**: Create and configure collections
- **Document Processing**: Chunk text and create points
- **Search Operations**: Text-based and vector-based search
- **CRUD Operations**: Create, read, update, delete documents

### Document Structure

Each document chunk is stored as a Qdrant point with:

```python
{
    "id": "unique-uuid",
    "vector": [0.0] * 1536,  # Placeholder or actual embedding
    "payload": {
        "project_id": "project_001",
        "project_name": "Project Name",
        "document_id": "doc_hash",
        "document_name": "Document Name", 
        "chunk_id": "doc_hash_chunk_1",
        "chunk_number": 1,
        "total_chunks": 3,
        "text_content": "Actual text content...",
        "character_count": 1500,
        "created_at": "2024-01-01T12:00:00",
        "updated_at": "2024-01-01T12:00:00",
        "metadata": {
            "file_path": "/path/to/file",
            "processing_version": "1.0",
            "text_length": 4500
        }
    }
}
```

## 🔍 Search Capabilities

### Text-Based Search

Current implementation uses payload filtering and text matching:

```python
results = indexer.search_by_text(
    query_text="machine learning algorithms",
    project_id="ml_project",  # Optional filter
    limit=10,
    score_threshold=0.0
)
```

### Vector Search (Ready for Embeddings)

When embeddings are available:

```python
results = indexer.search_by_vector(
    query_vector=embedding_vector,
    project_id="project_001",
    limit=10,
    score_threshold=0.8
)
```

## 🐳 Docker Configuration

The setup uses the official Qdrant Docker image with:

- **HTTP API**: Port 6333
- **gRPC API**: Port 6334  
- **Web UI**: http://localhost:6333/dashboard
- **Persistent Storage**: Docker volume `qdrant_storage`

### Docker Commands

```bash
# Start Qdrant
docker start qdrant-text-indexer

# Stop Qdrant  
docker stop qdrant-text-indexer

# View logs
docker logs qdrant-text-indexer

# Remove container
docker rm qdrant-text-indexer
```

## ⚙️ Configuration Options

### QdrantTextIndexer Parameters

```python
QdrantTextIndexer(
    qdrant_host="localhost",        # Qdrant server host
    qdrant_port=6333,              # HTTP API port
    qdrant_grpc_port=6334,         # gRPC port (if using gRPC)
    collection_name="documents",    # Collection name
    vector_size=1536,              # Embedding dimension
    use_grpc=False                 # Use gRPC for better performance
)
```

### Collection Configuration

- **Vector Size**: 1536 (optimized for text-embedding-3-small)
- **Distance Metric**: Cosine similarity
- **Indexing**: HNSW algorithm for fast similarity search
- **Storage**: Persistent with Docker volumes

## 🔗 Integration with Embeddings

To add semantic search with embeddings:

1. Install OpenAI client: `pip install openai`
2. Generate embeddings for your text chunks
3. Pass embedding vectors to `index_text_document()`
4. Use `search_by_vector()` for semantic search

Example with OpenAI embeddings:

```python
import openai

# Generate embedding
response = openai.embeddings.create(
    model="text-embedding-3-small",
    input="your text here"
)
embedding = response.data[0].embedding

# Index with embedding
indexer.index_text_document(
    text_content="your text",
    project_id="project_001",
    project_name="Project",
    document_name="Document",
    embedding_vector=embedding
)

# Search by similarity
results = indexer.search_by_vector(
    query_vector=query_embedding,
    limit=5
)
```

## 📊 Performance Features

- **Batch Operations**: Efficient bulk indexing with point batches
- **Filtering**: Fast project-based filtering with payload conditions
- **Scalability**: Horizontal scaling support with Qdrant clustering
- **Memory Efficiency**: Optimized vector storage and indexing
- **Real-time**: Immediate availability of indexed data

## 🛠️ Troubleshooting

### Common Issues

1. **Qdrant not accessible**
   ```bash
   # Check if container is running
   docker ps | grep qdrant
   
   # Restart container
   docker restart qdrant-text-indexer
   ```

2. **Collection creation fails**
   ```bash
   # Check Qdrant logs
   docker logs qdrant-text-indexer
   ```

3. **Search returns no results**
   - Verify documents are indexed: `indexer.get_collection_info()`
   - Check project_id filters
   - Verify text content in payloads

### Performance Tuning

- Use gRPC for large operations: `use_grpc=True`
- Adjust batch sizes for bulk operations
- Configure HNSW parameters for your use case
- Monitor memory usage with large collections

## 📚 Resources

- **Qdrant Documentation**: https://qdrant.tech/documentation/
- **Python Client**: https://github.com/qdrant/qdrant-client
- **Docker Image**: https://hub.docker.com/r/qdrant/qdrant
- **Examples**: https://github.com/qdrant/qdrant/tree/master/examples

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve this text indexing system.

## 📄 License

This project is open-source and available under the MIT License.
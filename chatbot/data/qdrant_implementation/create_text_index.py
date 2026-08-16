from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    Distance,
)
from typing import List, Dict, Any, Optional
import hashlib
from datetime import datetime
import uuid


class QdrantTextIndexer:
    def __init__(
        self,
        qdrant_host: str = "localhost",
        qdrant_port: int = 6333,
        qdrant_grpc_port: int = 6334,
        collection_name: str = "text_documents",
        vector_size: int = 1536,  # For text-embedding-3-small
        use_grpc: bool = False,
    ):
        """
        Initialize Qdrant Text Indexer

        Args:
            qdrant_host: Qdrant server host
            qdrant_port: Qdrant HTTP API port
            qdrant_grpc_port: Qdrant gRPC port (if using gRPC)
            collection_name: Name of the collection to store documents
            vector_size: Size of embedding vectors (1536 for text-embedding-3-small)
            use_grpc: Whether to use gRPC connection (faster for large operations)
        """

        # Initialize Qdrant client
        if use_grpc:
            self.client = QdrantClient(
                host=qdrant_host, grpc_port=qdrant_grpc_port, prefer_grpc=True
            )
        else:
            self.client = QdrantClient(host=qdrant_host, port=qdrant_port)

        self.collection_name = collection_name
        self.vector_size = vector_size
        self.chunk_size = 30000  # 30k characters as requested

    def create_collection(self) -> bool:
        """
        Create collection with proper vector configuration if it doesn't exist
        """
        try:
            # Check if collection exists
            collections = self.client.get_collections()
            collection_names = [c.name for c in collections.collections]

            if self.collection_name not in collection_names:
                # Create collection with vector configuration
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=self.vector_size,
                        distance=Distance.COSINE,  # Cosine similarity for text embeddings
                    ),
                )
                print(f"Collection '{self.collection_name}' created successfully")
                return True
            else:
                print(f"Collection '{self.collection_name}' already exists")
                return True

        except Exception as e:
            print(f"Error creating collection: {str(e)}")
            return False

    def chunk_text(self, text: str) -> List[Dict[str, Any]]:
        """
        Split text into chunks of specified size (30k characters)
        """
        chunks = []
        text_length = len(text)

        for i in range(0, text_length, self.chunk_size):
            chunk_text = text[i : i + self.chunk_size]

            # Try to break at sentence or paragraph boundaries if possible
            if i + self.chunk_size < text_length:
                # Look for natural break points within last 1000 characters
                break_points = ["\n\n", ". ", ".\n", "!\n", "?\n"]
                for break_point in break_points:
                    last_break = chunk_text.rfind(break_point)
                    if last_break > len(chunk_text) - 1000:
                        chunk_text = chunk_text[: last_break + len(break_point)]
                        break

            chunk_info = {
                "text": chunk_text.strip(),
                "chunk_number": len(chunks) + 1,
                "character_count": len(chunk_text),
                "start_position": i,
                "end_position": i + len(chunk_text),
            }

            chunks.append(chunk_info)

        # Add total chunks info to each chunk
        total_chunks = len(chunks)
        for chunk in chunks:
            chunk["total_chunks"] = total_chunks

        return chunks

    def generate_document_id(self, file_path: str, project_id: str) -> str:
        """
        Generate a unique document ID based on file path and project
        """
        content = f"{project_id}_{file_path}"
        return hashlib.md5(content.encode()).hexdigest()

    def generate_chunk_id(self, document_id: str, chunk_number: int) -> str:
        """
        Generate a unique chunk ID
        """
        return f"{document_id}_chunk_{chunk_number}"

    def index_text_document(
        self,
        text_content: str,
        project_id: str,
        project_name: str,
        document_name: str,
        file_path: str = None,
        embedding_vector: Optional[List[float]] = None,
    ) -> bool:
        """
        Process and index a text document in Qdrant

        Args:
            text_content: The text content to index
            project_id: Unique identifier for the project
            project_name: Human-readable project name
            document_name: Name of the document
            file_path: Optional file path reference
            embedding_vector: Optional pre-computed embedding vector
        """
        try:
            if not text_content:
                print("No text content provided")
                return False

            # Generate document ID
            document_id = self.generate_document_id(
                file_path or document_name, project_id
            )

            # Split text into chunks
            print("Chunking text content...")
            chunks = self.chunk_text(text_content)
            print(f"Created {len(chunks)} chunks")

            # Process each chunk
            current_time = datetime.utcnow().isoformat()
            points = []

            for chunk_info in chunks:
                print(
                    f"Processing chunk {chunk_info['chunk_number']}/{chunk_info['total_chunks']}"
                )

                # Create payload (metadata) for the chunk
                payload = {
                    "project_id": project_id,
                    "project_name": project_name,
                    "document_id": document_id,
                    "document_name": document_name,
                    "chunk_id": self.generate_chunk_id(
                        document_id, chunk_info["chunk_number"]
                    ),
                    "chunk_number": chunk_info["chunk_number"],
                    "total_chunks": chunk_info["total_chunks"],
                    "text_content": chunk_info["text"],
                    "character_count": chunk_info["character_count"],
                    "created_at": current_time,
                    "updated_at": current_time,
                    "metadata": {
                        "file_path": file_path or document_name,
                        "processing_version": "1.0",
                        "text_length": len(text_content),
                    },
                }

                # Generate a vector (dummy vector if no embedding provided)
                if embedding_vector and len(embedding_vector) == self.vector_size:
                    vector = embedding_vector
                else:
                    # Create a dummy vector filled with zeros for now
                    # In practice, you would generate embeddings here
                    vector = [0.0] * self.vector_size

                # Create point for Qdrant
                point_id = str(uuid.uuid4())  # Generate unique UUID for the point
                point = PointStruct(id=point_id, vector=vector, payload=payload)

                points.append(point)

            # Upsert all points to Qdrant
            self.client.upsert(collection_name=self.collection_name, points=points)

            print(f"Successfully indexed document: {document_name}")
            return True

        except Exception as e:
            print(f"Error indexing text document: {str(e)}")
            return False

    def search_by_text(
        self,
        query_text: str,
        project_id: str = None,
        limit: int = 10,
        score_threshold: float = 0.0,
    ) -> List[Dict]:
        """
        Search documents by text content using scroll and filter
        Note: This is text-based search, not vector similarity search
        """
        try:
            # Build filter conditions
            must_conditions = []

            if project_id:
                must_conditions.append(
                    FieldCondition(key="project_id", match=MatchValue(value=project_id))
                )

            # For text search, we'll scroll through documents and filter by text content
            # This is a simple implementation - in practice, you might want to use
            # full-text search capabilities or hybrid search

            filter_condition = None
            if must_conditions:
                filter_condition = Filter(must=must_conditions)

            # Scroll through all points and filter by text content
            points, _ = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=filter_condition,
                limit=limit * 3,  # Get more to filter by text
                with_payload=True,
                with_vectors=False,
            )

            # Filter points by text content (simple text matching)
            query_words = query_text.lower().split()
            matching_points = []

            for point in points:
                if point.payload and "text_content" in point.payload:
                    text_content = point.payload["text_content"].lower()

                    # Simple scoring based on word matches
                    score = 0
                    for word in query_words:
                        if word in text_content:
                            score += text_content.count(word)

                    if score >= score_threshold:
                        matching_points.append(
                            {
                                "_id": str(point.id),
                                "_score": score,
                                "_source": point.payload,
                            }
                        )

            # Sort by score (descending)
            matching_points.sort(key=lambda x: x["_score"], reverse=True)

            return matching_points[:limit]

        except Exception as e:
            print(f"Error searching text: {str(e)}")
            return []

    def search_by_vector(
        self,
        query_vector: List[float],
        project_id: str = None,
        limit: int = 10,
        score_threshold: float = 0.0,
    ) -> List[Dict]:
        """
        Search documents by vector similarity
        """
        try:
            # Build filter conditions
            must_conditions = []

            if project_id:
                must_conditions.append(
                    FieldCondition(key="project_id", match=MatchValue(value=project_id))
                )

            filter_condition = None
            if must_conditions:
                filter_condition = Filter(must=must_conditions)

            # Perform vector similarity search
            search_result = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=filter_condition,
                limit=limit,
                score_threshold=score_threshold,
                with_payload=True,
            )

            # Convert to consistent format
            results = []
            for hit in search_result:
                results.append(
                    {"_id": str(hit.id), "_score": hit.score, "_source": hit.payload}
                )

            return results

        except Exception as e:
            print(f"Error searching by vector: {str(e)}")
            return []

    def delete_document(self, document_id: str) -> bool:
        """
        Delete all chunks of a document
        """
        try:
            # Filter points by document_id
            filter_condition = Filter(
                must=[
                    FieldCondition(
                        key="document_id", match=MatchValue(value=document_id)
                    )
                ]
            )

            # Get all points for this document
            points, _ = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=filter_condition,
                with_payload=False,
                with_vectors=False,
            )

            # Delete points
            if points:
                point_ids = [point.id for point in points]
                self.client.delete(
                    collection_name=self.collection_name, points_selector=point_ids
                )
                print(f"Deleted {len(point_ids)} chunks for document: {document_id}")
                return True
            else:
                print(f"No chunks found for document: {document_id}")
                return False

        except Exception as e:
            print(f"Error deleting document: {str(e)}")
            return False

    def get_collection_info(self) -> Dict[str, Any]:
        """
        Get information about the collection
        """
        try:
            info = self.client.get_collection(collection_name=self.collection_name)
            return {
                "collection_name": self.collection_name,
                "points_count": info.points_count,
                "vectors_count": info.vectors_count,
                "indexed_vectors_count": info.indexed_vectors_count,
                "status": info.status.value,
                "optimizer_status": info.optimizer_status.ok,
                "disk_data_size": getattr(info, "disk_data_size", "N/A"),
                "ram_data_size": getattr(info, "ram_data_size", "N/A"),
            }
        except Exception as e:
            print(f"Error getting collection info: {str(e)}")
            return {}


def main():
    """
    Example usage of the QdrantTextIndexer
    """
    # Initialize indexer
    indexer = QdrantTextIndexer(
        qdrant_host="localhost",
        qdrant_port=6333,
        collection_name="demo_text_collection",
        vector_size=1536,
    )

    # Create the collection
    print("Creating Qdrant collection...")
    if indexer.create_collection():
        print("Collection setup completed successfully!")

        # Example: Index a text document
        # Uncomment and modify the following lines to index your text
        """
        # Read your text content from any source (file, database, API, etc.)
        with open("/path/to/your/document.txt", "r", encoding="utf-8") as f:
            text_content = f.read()
        
        success = indexer.index_text_document(
            text_content=text_content,
            project_id="project_001",
            project_name="Your Project Name",
            document_name="Document Name",
            file_path="/path/to/your/document.txt"
        )
        
        if success:
            print("Text document indexed successfully!")
            
            # Example: Search for content
            results = indexer.search_by_text(
                query_text="your search query here",
                project_id="project_001",
                limit=5
            )
            
            print(f"Found {len(results)} matching chunks")
            for i, hit in enumerate(results):
                print(f"Result {i+1}: Score {hit['_score']}")
                print(f"Chunk {hit['_source']['chunk_number']}/{hit['_source']['total_chunks']}")
                print(f"Text preview: {hit['_source']['text_content'][:200]}...")
                print("-" * 50)
        """
    else:
        print("Failed to create collection")


if __name__ == "__main__":
    main()

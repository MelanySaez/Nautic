from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct
import uuid
from typing import List, Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class DocumentRetrievalSystem:
    def __init__(
        self,
        collection_name: str = "documents",
        host: str = "http://localhost:6333",
        api_key: str = "api_key",
    ):
        """
        Initialize the document retrieval system with BGE-M3 embeddings and Qdrant
        """
        # Initialize BGE-M3 model
        self.model = SentenceTransformer("BAAI/bge-m3")

        # Initialize Qdrant client
        self.client = QdrantClient(url=host, api_key=api_key)
        self.collection_name = collection_name

        # Create collection if it doesn't exist
        self._create_collection()

    def _create_collection(self):
        """Create collection with BGE-M3 dimensions (1024)"""
        if not self.client.collection_exists(self.collection_name):
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=1024, distance=Distance.COSINE  # BGE-M3 embedding dimension
                ),
            )
            print(f"Created collection: {self.collection_name}")
        else:
            print(f"Collection {self.collection_name} already exists")

    def add_document(self, text: str, metadata: Dict[str, Any] = None) -> str:
        """
        Add a single document to the collection

        Args:
            text: The document text to add
            metadata: Optional metadata dictionary

        Returns:
            Document ID
        """
        # Generate embedding
        embedding = self.model.encode(text).tolist()

        # Generate unique ID
        doc_id = str(uuid.uuid4())

        # Prepare metadata
        doc_metadata = metadata or {}
        doc_metadata["text"] = text

        # Create point
        point = PointStruct(id=doc_id, vector=embedding, payload=doc_metadata)

        # Insert into Qdrant
        self.client.upsert(collection_name=self.collection_name, points=[point])

        print(f"Added document with ID: {doc_id}")
        return doc_id

    def add_documents(
        self, documents: List[str], metadata_list: List[Dict[str, Any]] = None
    ) -> List[str]:
        """
        Add multiple documents to the collection

        Args:
            documents: List of document texts
            metadata_list: Optional list of metadata dictionaries

        Returns:
            List of document IDs
        """
        if metadata_list and len(metadata_list) != len(documents):
            raise ValueError("Number of metadata items must match number of documents")

        # Generate embeddings for all documents
        embeddings = self.model.encode(documents).tolist()

        # Create points
        points = []
        doc_ids = []

        for i, (text, embedding) in enumerate(zip(documents, embeddings)):
            doc_id = str(uuid.uuid4())
            doc_ids.append(doc_id)

            # Prepare metadata
            metadata = metadata_list[i] if metadata_list else {}
            metadata["text"] = text

            point = PointStruct(id=doc_id, vector=embedding, payload=metadata)
            points.append(point)

        # Insert all points
        self.client.upsert(collection_name=self.collection_name, points=points)

        print(f"Added {len(documents)} documents")
        return doc_ids

    def search_documents(
        self, query: str, limit: int = 5, score_threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents

        Args:
            query: Search query text
            limit: Maximum number of results
            score_threshold: Minimum similarity score

        Returns:
            List of search results with text, metadata, and score
        """
        # Generate query embedding
        query_embedding = self.model.encode(query).tolist()

        # Search in Qdrant
        search_results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=limit,
            score_threshold=score_threshold,
        )

        # Format results
        results = []
        for result in search_results:
            results.append(
                {
                    "id": result.id,
                    "text": result.payload.get("text", ""),
                    "metadata": {
                        k: v for k, v in result.payload.items() if k != "text"
                    },
                    "score": result.score,
                }
            )

        return results

    def get_document_by_id(self, doc_id: str) -> Dict[str, Any]:
        """
        Retrieve a specific document by ID

        Args:
            doc_id: Document ID

        Returns:
            Document data or None if not found
        """
        try:
            result = self.client.retrieve(
                collection_name=self.collection_name, ids=[doc_id]
            )

            if result:
                point = result[0]
                return {
                    "id": point.id,
                    "text": point.payload.get("text", ""),
                    "metadata": {k: v for k, v in point.payload.items() if k != "text"},
                }
        except Exception as e:
            print(f"Error retrieving document {doc_id}: {e}")

        return None

    def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document by ID

        Args:
            doc_id: Document ID to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.delete(
                collection_name=self.collection_name, points_selector=[doc_id]
            )
            print(f"Deleted document: {doc_id}")
            return True
        except Exception as e:
            print(f"Error deleting document {doc_id}: {e}")
            return False

    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection"""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "name": info.config.params.vectors.size,
                "vector_size": info.config.params.vectors.size,
                "distance": info.config.params.vectors.distance,
                "points_count": info.points_count,
            }
        except Exception as e:
            print(f"Error getting collection info: {e}")
            return {}


# Example usage
if __name__ == "__main__":
    # Initialize the system
    api_key = os.getenv("API_KEY_QDRANT")

    doc_system = DocumentRetrievalSystem(api_key=api_key)

    # Example documents
    sample_documents = [
        "How to bake a strawberry cake with fresh ingredients",
        "Python programming best practices and coding standards",
        "Machine learning algorithms for natural language processing",
        "Docker containerization and deployment strategies",
        "Database optimization techniques for large-scale applications",
    ]

    # Add documents with metadata
    metadata_examples = [
        {"category": "cooking", "difficulty": "beginner"},
        {"category": "programming", "language": "python"},
        {"category": "ai", "topic": "nlp"},
        {"category": "devops", "tool": "docker"},
        {"category": "database", "scale": "enterprise"},
    ]

    print("=== Adding Documents ===")
    doc_ids = doc_system.add_documents(sample_documents, metadata_examples)

    print("\n=== Collection Info ===")
    info = doc_system.get_collection_info()
    print(f"Collection info: {info}")

    print("\n=== Searching Documents ===")
    # Search examples
    queries = [
        "How to make a cake",
        "Python coding tips",
        "AI and language processing",
        "Container deployment",
    ]

    for query in queries:
        print(f"\nQuery: '{query}'")
        results = doc_system.search_documents(query, limit=2)
        for i, result in enumerate(results, 1):
            print(f"  {i}. Score: {result['score']:.3f}")
            print(f"     Text: {result['text']}")
            print(f"     Metadata: {result['metadata']}")

    print("\n=== Retrieving Specific Document ===")
    if doc_ids:
        doc = doc_system.get_document_by_id(doc_ids[0])
        if doc:
            print(f"Document: {doc}")

#!/usr/bin/env python3
"""
Bulk Update/Delete Example for QdrantTextIndexer

This script demonstrates:
- Creating a collection
- Adding multiple documents
- Searching documents (text-based)
- Updating documents
- Deleting documents
- Collection statistics
"""

import sys
import time
from create_text_index import QdrantTextIndexer


def print_separator(title: str):
    """Print a nice separator for different sections"""
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def print_search_results(results, title="Search Results"):
    """Pretty print search results"""
    print(f"\n{title}:")
    print("-" * 40)

    if not results:
        print("No results found.")
        return

    for i, hit in enumerate(results, 1):
        source = hit["_source"]
        score = hit["_score"]

        print(f"Result {i}: (Score: {score:.2f})")
        print(f"  Project: {source['project_name']} (ID: {source['project_id']})")
        print(f"  Document: {source['document_name']}")
        print(f"  Chunk: {source['chunk_number']}/{source['total_chunks']}")
        print(f"  Text preview: {source['text_content'][:150]}...")

        print("-" * 40)


def main():
    """Main demonstration function"""

    print_separator("QdrantTextIndexer Demo - Bulk Operations")

    # Initialize indexer
    print("Initializing QdrantTextIndexer...")
    indexer = QdrantTextIndexer(
        qdrant_host="localhost",
        qdrant_port=6333,
        collection_name="demo_text_collection",
        vector_size=1536,
    )

    # Step 1: Create the collection
    print_separator("Step 1: Creating Collection")

    try:
        if indexer.create_collection():
            print("✅ Collection created successfully!")
        else:
            print("❌ Failed to create collection")
            return
    except Exception as e:
        print(f"❌ Error creating collection: {e}")
        return

    # Step 2: Add multiple documents
    print_separator("Step 2: Adding Documents")

    # Sample documents to index
    documents = [
        {
            "text_content": """
            Machine Learning Fundamentals
            
            Machine learning is a subset of artificial intelligence that focuses on developing algorithms 
            and statistical models that enable computers to perform tasks without explicit instructions. 
            It relies on patterns and inference instead. Machine learning algorithms build mathematical 
            models based on training data to make predictions or decisions without being explicitly 
            programmed to perform the task.
            
            There are three main types of machine learning:
            1. Supervised Learning: Uses labeled training data
            2. Unsupervised Learning: Finds patterns in data without labels
            3. Reinforcement Learning: Learns through interaction with environment
            
            Common applications include email filtering, computer vision, recommendation systems, 
            and natural language processing.
            """,
            "project_id": "ml_project_001",
            "project_name": "Machine Learning Course",
            "document_name": "ML Fundamentals Chapter 1",
            "file_path": "/docs/ml/chapter1.txt",
        },
        {
            "text_content": """
            Deep Learning and Neural Networks
            
            Deep learning is a specialized subset of machine learning that uses artificial neural networks 
            with multiple layers (hence "deep") to model and understand complex patterns in data. 
            These networks are inspired by the structure and function of the human brain.
            
            Key concepts in deep learning:
            - Artificial neurons and activation functions
            - Backpropagation for training
            - Convolutional Neural Networks (CNNs) for image processing
            - Recurrent Neural Networks (RNNs) for sequential data
            - Transformer models for natural language processing
            
            Deep learning has revolutionized fields like computer vision, speech recognition, 
            natural language processing, and game playing (like AlphaGo).
            
            Popular frameworks include TensorFlow, PyTorch, and Keras.
            """,
            "project_id": "ml_project_001",
            "project_name": "Machine Learning Course",
            "document_name": "Deep Learning Chapter 2",
            "file_path": "/docs/ml/chapter2.txt",
        },
        {
            "text_content": """
            Qdrant Vector Database
            
            Qdrant is an open-source vector database and similarity search engine written in Rust. 
            It's designed to handle large-scale vector data and provide fast, accurate similarity search.
            
            Key features of Qdrant:
            - High-performance vector similarity search
            - Support for multiple vector types (dense and sparse)
            - Payload filtering for hybrid search
            - Horizontal scalability with distributed deployment
            - Rich filtering capabilities with complex conditions
            - Real-time indexing and searching
            - ACID transactions support
            
            Common use cases:
            - Semantic search and document retrieval
            - Recommendation systems
            - Image and video similarity search
            - Neural information retrieval
            - Anomaly detection
            - Chatbot and question-answering systems
            
            Qdrant supports various distance metrics including Cosine, Euclidean, and Dot Product
            for different types of similarity calculations.
            """,
            "project_id": "vector_project_002",
            "project_name": "Vector Database Project",
            "document_name": "Qdrant Overview",
            "file_path": "/docs/vector/qdrant.txt",
        },
    ]

    # Index all documents
    indexed_docs = []
    for i, doc in enumerate(documents, 1):
        print(f"Indexing document {i}/3: {doc['document_name']}")

        success = indexer.index_text_document(
            text_content=doc["text_content"],
            project_id=doc["project_id"],
            project_name=doc["project_name"],
            document_name=doc["document_name"],
            file_path=doc["file_path"],
        )

        if success:
            print(f"✅ Successfully indexed: {doc['document_name']}")
            indexed_docs.append(doc)
        else:
            print(f"❌ Failed to index: {doc['document_name']}")

    # Wait a moment for indexing to complete
    print("\nWaiting for documents to be indexed...")
    time.sleep(2)

    # Step 3: Search the index
    print_separator("Step 3: Searching Documents")

    # Test various search queries
    search_queries = [
        {
            "query": "machine learning algorithms",
            "description": "Search for machine learning content",
        },
        {
            "query": "neural networks deep learning",
            "description": "Search for deep learning content",
        },
        {
            "query": "qdrant vector database",
            "description": "Search for Qdrant content",
        },
        {"query": "TensorFlow PyTorch", "description": "Search for ML frameworks"},
    ]

    for search in search_queries:
        print(f"\n🔍 {search['description']}")
        print(f"Query: '{search['query']}'")

        results = indexer.search_by_text(query_text=search["query"], limit=3)

        print_search_results(results)

    # Step 4: Search by project
    print_separator("Step 4: Project-Specific Search")

    # Search within specific project
    print("🔍 Searching within 'Machine Learning Course' project only:")
    results = indexer.search_by_text(
        query_text="learning algorithms", project_id="ml_project_001", limit=5
    )
    print_search_results(results, "ML Project Results")

    # Step 5: Update a document
    print_separator("Step 5: Updating Documents")

    # Add updated content to the first document
    updated_content = (
        documents[0]["text_content"]
        + """
    
    UPDATE: Recent Advances in Machine Learning
    
    Recent developments in machine learning include:
    - Large Language Models (LLMs) like GPT, BERT, and T5
    - Few-shot and zero-shot learning techniques
    - Federated learning for privacy-preserving ML
    - AutoML for automated model selection and hyperparameter tuning
    - Explainable AI (XAI) for model interpretability
    - Edge AI for deploying models on mobile and IoT devices
    
    These advances are making machine learning more accessible, efficient, and applicable 
    to a wider range of problems and domains.
    """
    )

    print("Updating the first document with new content...")

    success = indexer.index_text_document(
        text_content=updated_content,
        project_id="ml_project_001",
        project_name="Machine Learning Course",
        document_name="ML Fundamentals Chapter 1 (Updated)",
        file_path="/docs/ml/chapter1_updated.txt",
    )

    if success:
        print("✅ Document updated successfully!")

        # Wait for update to be indexed
        time.sleep(1)

        # Search for updated content
        print("\n🔍 Searching for updated content:")
        results = indexer.search_by_text(
            query_text="Large Language Models GPT", project_id="ml_project_001", limit=2
        )
        print_search_results(results, "Updated Content Results")
    else:
        print("❌ Failed to update document")

    # Step 6: Advanced search examples
    print_separator("Step 6: Advanced Search Examples")

    # Search across all projects
    print("🔍 Cross-project search for 'data processing':")
    results = indexer.search_by_text(query_text="data processing analytics", limit=5)
    print_search_results(results, "Cross-Project Results")

    # Step 7: Collection statistics
    print_separator("Step 7: Collection Statistics")

    print("📊 Collection Information:")
    try:
        info = indexer.get_collection_info()
        if info:
            print(f"• Collection: {info.get('collection_name', 'N/A')}")
            print(f"• Total points: {info.get('points_count', 'N/A')}")
            print(f"• Vectors count: {info.get('vectors_count', 'N/A')}")
            print(f"• Indexed vectors: {info.get('indexed_vectors_count', 'N/A')}")
            print(f"• Status: {info.get('status', 'N/A')}")
            print(f"• Optimizer OK: {info.get('optimizer_status', 'N/A')}")
            print(f"• Disk data size: {info.get('disk_data_size', 'N/A')}")
            print(f"• RAM data size: {info.get('ram_data_size', 'N/A')}")
        else:
            print("Could not retrieve collection information")
    except Exception as e:
        print(f"Error getting collection info: {e}")

    # Step 8: Demonstrate document deletion
    print_separator("Step 8: Document Deletion Example")

    print("🗑️ Document deletion capabilities:")
    print("- Delete by document_id to remove all chunks")
    print("- Filter and delete by project_id")
    print("- Point-level deletion by ID")
    print("\nNote: Deletion methods are available but not executed in this demo")

    print_separator("Demo Complete!")

    print(
        """
🎉 Successfully demonstrated:
   ✅ Collection creation
   ✅ Document indexing (bulk add)
   ✅ Text-based search
   ✅ Project-specific filtering  
   ✅ Document updates
   ✅ Cross-project searches
   ✅ Collection statistics
   
💡 Next steps you could try:
   - Add vector embeddings for semantic search
   - Implement hybrid search (text + vector)
   - Try different distance metrics
   - Explore payload filtering
   - Add batch operations
   - Implement document deletion
   
🔧 Vector Database Features:
   - Ready for embeddings (1536-dim vectors)
   - Cosine similarity for semantic search
   - Rich payload filtering
   - Horizontal scalability
   - ACID transactions
    """
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️  Demo interrupted by user")
    except Exception as e:
        print(f"\n❌ Demo failed with error: {e}")
        sys.exit(1)

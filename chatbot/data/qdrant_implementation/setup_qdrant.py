#!/usr/bin/env python3
"""
Qdrant Setup and Configuration Script

This script helps set up Qdrant for the text indexing system.
Includes Docker setup instructions and basic configuration.
"""

import os
import sys
import subprocess
import time
from create_text_index import QdrantTextIndexer


def print_separator(title: str):
    """Print a nice separator for different sections"""
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def check_docker():
    """Check if Docker is available"""
    try:
        result = subprocess.run(
            ["docker", "--version"], capture_output=True, text=True, check=True
        )
        print(f"✅ Docker found: {result.stdout.strip()}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Docker not found. Please install Docker first.")
        return False


def check_qdrant_running():
    """Check if Qdrant is already running"""
    try:
        indexer = QdrantTextIndexer()
        collections = indexer.client.get_collections()
        print("✅ Qdrant is running and accessible")
        print(f"   Found {len(collections.collections)} existing collections")
        return True
    except Exception as e:
        print(f"❌ Qdrant not accessible: {e}")
        return False


def start_qdrant_docker():
    """Start Qdrant using Docker"""
    print("Starting Qdrant with Docker...")

    # Docker command to run Qdrant
    docker_cmd = [
        "docker",
        "run",
        "-d",
        "--name",
        "qdrant-text-indexer",
        "-p",
        "6333:6333",
        "-p",
        "6334:6334",
        "-e",
        "QDRANT__SERVICE__HTTP_PORT=6333",
        "-e",
        "QDRANT__SERVICE__GRPC_PORT=6334",
        "-v",
        "qdrant_storage:/qdrant/storage:z",
        "qdrant/qdrant:latest",
    ]

    try:
        # Stop and remove existing container if it exists
        subprocess.run(
            ["docker", "stop", "qdrant-text-indexer"], capture_output=True, check=False
        )
        subprocess.run(
            ["docker", "rm", "qdrant-text-indexer"], capture_output=True, check=False
        )

        # Start new container
        result = subprocess.run(docker_cmd, capture_output=True, text=True, check=True)

        print("✅ Qdrant container started successfully")
        print(f"   Container ID: {result.stdout.strip()}")

        # Wait for Qdrant to be ready
        print("Waiting for Qdrant to be ready...")
        max_retries = 30
        for i in range(max_retries):
            time.sleep(2)
            if check_qdrant_running():
                return True
            print(f"   Retry {i+1}/{max_retries}...")

        print("❌ Qdrant failed to start within timeout")
        return False

    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to start Qdrant: {e}")
        print(f"   Error output: {e.stderr}")
        return False


def install_requirements():
    """Install Python requirements"""
    print("Installing Python requirements...")

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
            capture_output=True,
            text=True,
            check=True,
        )
        print("✅ Requirements installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install requirements: {e}")
        print(f"   Error output: {e.stderr}")
        return False


def create_test_collection():
    """Create a test collection to verify setup"""
    print("Creating test collection...")

    try:
        indexer = QdrantTextIndexer(collection_name="setup_test_collection")

        if indexer.create_collection():
            print("✅ Test collection created successfully")

            # Test indexing a simple document
            success = indexer.index_text_document(
                text_content="This is a test document for Qdrant setup verification.",
                project_id="setup_test",
                project_name="Setup Test Project",
                document_name="Test Document",
                file_path="test.txt",
            )

            if success:
                print("✅ Test document indexed successfully")

                # Test search
                results = indexer.search_by_text(query_text="test document", limit=1)

                if results:
                    print("✅ Test search successful")
                    print(f"   Found: {results[0]['_source']['document_name']}")
                    return True
                else:
                    print("❌ Test search failed - no results")
                    return False
            else:
                print("❌ Test document indexing failed")
                return False
        else:
            print("❌ Test collection creation failed")
            return False

    except Exception as e:
        print(f"❌ Test collection setup failed: {e}")
        return False


def show_connection_info():
    """Show connection information"""
    print_separator("Connection Information")

    print("🔗 Qdrant Connection Details:")
    print("   HTTP API: http://localhost:6333")
    print("   gRPC API: localhost:6334")
    print("   Web UI: http://localhost:6333/dashboard")

    print("\n📋 Configuration:")
    print("   Default collection: demo_text_collection")
    print("   Vector size: 1536 (for text-embedding-3-small)")
    print("   Distance metric: Cosine similarity")

    print("\n🐳 Docker Commands:")
    print("   Start: docker start qdrant-text-indexer")
    print("   Stop: docker stop qdrant-text-indexer")
    print("   Logs: docker logs qdrant-text-indexer")
    print("   Remove: docker rm qdrant-text-indexer")


def main():
    """Main setup function"""
    print_separator("Qdrant Text Indexer Setup")

    print("This script will help you set up Qdrant for text indexing.")
    print("Prerequisites: Docker installed and running")

    # Step 1: Check Docker
    print_separator("Step 1: Checking Docker")
    if not check_docker():
        print("\n🔧 Install Docker from: https://docs.docker.com/get-docker/")
        return False

    # Step 2: Install Python requirements
    print_separator("Step 2: Installing Requirements")
    if not install_requirements():
        return False

    # Step 3: Check if Qdrant is already running
    print_separator("Step 3: Checking Qdrant Status")
    if not check_qdrant_running():
        # Step 4: Start Qdrant
        print_separator("Step 4: Starting Qdrant")
        if not start_qdrant_docker():
            return False

    # Step 5: Create test collection
    print_separator("Step 5: Testing Setup")
    if not create_test_collection():
        return False

    # Step 6: Show connection info
    show_connection_info()

    print_separator("Setup Complete!")

    print(
        """
🎉 Qdrant setup completed successfully!

✅ What's ready:
   - Qdrant server running on localhost:6333
   - Python client installed and tested
   - Test collection created and verified
   - Ready for text indexing operations

🚀 Next steps:
   1. Run: python bulk_update_delete.py
   2. Explore the Qdrant Web UI at http://localhost:6333/dashboard
   3. Start building your text indexing application!

📚 Resources:
   - Qdrant Documentation: https://qdrant.tech/documentation/
   - Python Client: https://github.com/qdrant/qdrant-client
   - Examples: https://github.com/qdrant/qdrant/tree/master/examples
    """
    )

    return True


if __name__ == "__main__":
    try:
        success = main()
        if not success:
            print("\n❌ Setup failed. Please check the errors above.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⏹️  Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Setup failed with error: {e}")
        sys.exit(1)

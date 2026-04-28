import os
import logging
from pypdf import PdfReader
import chromadb
from chromadb.utils import embedding_functions

logger = logging.getLogger(__name__)

class DocumentPipeline:
    def __init__(self):
        self.chunk_size = int(os.environ.get("CHUNK_SIZE", 500))
        self.chunk_overlap = int(os.environ.get("CHUNK_OVERLAP", 50))
        self.strategy = os.environ.get("CHUNK_STRATEGY", "fixed")
        
        db_dir = os.environ.get("CHROMA_DB_DIR", "./chroma_db")
        logger.info(f"Initializing ChromaDB connection at {db_dir}")
        self.client = chromadb.PersistentClient(path=db_dir)
        
        # Default embedding function uses all-MiniLM-L6-v2
        self.emb_fn = embedding_functions.DefaultEmbeddingFunction()
        self.collection = self.client.get_or_create_collection(
            name="document_knowledge",
            embedding_function=self.emb_fn
        )

    def extract_text(self, filepath: str) -> str:
        logger.info(f"Extracting text from: {filepath}")
        text = ""
        if filepath.lower().endswith(".pdf"):
            reader = PdfReader(filepath)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        elif filepath.lower().endswith(".txt"):
            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            raise ValueError("Unsupported file format. Only PDF and TXT are supported.")
        logger.info(f"Extracted {len(text)} characters of text.")
        return text

    def build_chunks(self, text: str) -> list[str]:
        logger.info(f"Chunking with strategy '{self.strategy}', size={self.chunk_size}, overlap={self.chunk_overlap}")
        chunks = []
        if self.strategy == "sentence":
            # Simple sentence splitting fallback if sentence strategy chosen
            sentences = [s.strip() + "." for s in text.replace("\n", " ").split(".") if s.strip()]
            current_chunk = ""
            for sentence in sentences:
                if len(current_chunk) + len(sentence) <= self.chunk_size:
                    current_chunk += " " + sentence
                else:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = sentence
            if current_chunk:
                chunks.append(current_chunk.strip())
        else:
            # Fixed length sliding window chunking
            start = 0
            while start < len(text):
                end = start + self.chunk_size
                chunk = text[start:end]
                chunks.append(chunk)
                start += (self.chunk_size - self.chunk_overlap)
        
        logger.info(f"Created {len(chunks)} chunks.")
        return chunks

    def process_file(self, filepath: str, scope: str = "global", session_id: str = None):
        try:
            text = self.extract_text(filepath)
            if not text.strip():
                logger.warning("Extracted text is empty. Skipping insertion.")
                return False

            chunks = self.build_chunks(text)
            file_ext = filepath.split(".")[-1].lower() if "." in filepath else "txt"
            
            # Simple keyword extractor
            stopwords = {"the","and","a","to","of","in","i","is","that","it","on","you","this","for","but","with","are","have","be","at","or","as","was","so","if","out","not"}
            
            ids = [f"{os.path.basename(filepath)}_{i}" for i in range(len(chunks))]
            metadatas = []
            for i in range(len(chunks)):
                # Extract basic keywords from the chunk text
                words = ''.join([c if c.isalnum() or c.isspace() else ' ' for c in chunks[i]]).lower().split()
                filtered = [w for w in words if w not in stopwords and len(w) > 3]
                # count freqs
                freq = {}
                for w in filtered:
                    freq[w] = freq.get(w, 0) + 1
                top_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:5]
                keywords_str = ", ".join([w[0] for w in top_words])
                
                meta = {
                    "source": filepath, 
                    "chunk_index": i,
                    "scope": scope,
                    "file_type": file_ext,
                    "keywords": keywords_str
                }
                if scope == "local" and session_id:
                    meta["session_id"] = session_id
                metadatas.append(meta)
            
            logger.info(f"📚 [VECTOR] Adding {len(chunks)} chunks to Vector DB with scope='{scope}'...")
            self.collection.add(
                documents=chunks,
                metadatas=metadatas,
                ids=ids
            )
            logger.info("✅ [VECTOR] Successfully added chunks to ChromaDB.")
            return True
        except Exception as e:
            logger.error(f"❌ [VECTOR] Error processing file {filepath}: {e}")
            return False

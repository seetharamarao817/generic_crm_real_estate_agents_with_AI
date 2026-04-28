import os
import logging
import requests
import chromadb
import time
from chromadb.utils import embedding_functions
from backend.database import save_message

logger = logging.getLogger(__name__)

GREETINGS = ["hello", "hi", "how are you", "how are you today", "hey", "greetings"]

class ChatPipeline:
    def __init__(self):
        or_models_str = os.environ.get("OPENROUTER_MODELS", "openai/gpt-3.5-turbo")
        self.or_models = [m.strip() for m in or_models_str.split(",") if m.strip()]
        
        hf_models_str = os.environ.get("HF_FALLBACK_MODELS", "Qwen/Qwen2.5-0.5B-Instruct")
        self.hf_models = [m.strip() for m in hf_models_str.split(",") if m.strip()]
        
        self.default_or_api_key = os.environ.get("OPENROUTER_API_KEY", "")
        
        db_dir = os.environ.get("CHROMA_DB_DIR", "./chroma_db")
        self.client = chromadb.PersistentClient(path=db_dir)
        self.emb_fn = embedding_functions.DefaultEmbeddingFunction()
        
        self.collection = self.client.get_or_create_collection(
            name="document_knowledge",
            embedding_function=self.emb_fn
        )
        
        self.hf_pipeline = None

    def _is_greeting(self, query: str) -> bool:
        normalized = query.lower().strip()
        for g in GREETINGS:
            if normalized == g or normalized.startswith(g + " ") or normalized.startswith(g + "!") or normalized.startswith(g + ","):
                return True
        return False

    def get_context(self, query: str, session_id: str) -> list:
        logger.info(f"📚 [VECTOR] Querying ChromaDB for context (Global + Session: {session_id})...")
        chunks_data = []
        try:
            where_condition = None
            if session_id:
                where_condition = {
                    "$or": [
                        {"scope": "global"},
                        {"session_id": session_id}
                    ]
                }
            else:
                where_condition = {"scope": "global"}
            
            results = self.collection.query(
                query_texts=[query],
                n_results=5,
                where=where_condition
            )
            if results and results.get('documents') and len(results['documents'][0]) > 0:
                docs = results['documents'][0]
                metas = results['metadatas'][0] if results.get('metadatas') else [{}] * len(docs)
                logger.info(f"✅ [VECTOR] Retrieved {len(docs)} chunks of context.")
                for d, m in zip(docs, metas):
                    chunks_data.append({"text": d, "metadata": m})
        except Exception as e:
            logger.error(f"❌ [VECTOR] Error querying ChromaDB: {e}")
        return chunks_data

    def generate_openrouter(self, messages, model, api_key_override=None):
        logger.info(f"🌐 [OPENROUTER] Attempting generation with model: {model}")
        start_time = time.time()
        api_key = api_key_override if (api_key_override and api_key_override.strip() != "null" and api_key_override.strip() != "") else self.default_or_api_key
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "http://localhost:5000",
            "X-OpenRouter-Title": "Local RAG Chatbot"
        }
        
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 2048
        }
        
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=20
            )
            resp.raise_for_status()
            data = resp.json()
            if 'choices' in data and len(data['choices']) > 0:
                content = data['choices'][0]['message']['content']
                # Try to extract tokens used
                tokens = data.get("usage", {}).get("total_tokens", 0)
                elapsed = time.time() - start_time
                return content, tokens, elapsed
            else:
                logger.error(f"❌ [OPENROUTER] Unexpected response format: {data}")
                return None, 0, 0
        except Exception as e:
            logger.error(f"❌ [OPENROUTER] Request failed for {model}: {e}")
            return None, 0, 0

    def _load_hf_pipeline(self, model_name):
        # We instantiate a new pipeline if empty or model changed
        if self.hf_pipeline is None or getattr(self.hf_pipeline, "_model_name", "") != model_name:
            logger.info(f"⚙️ [HUGGINGFACE] Loading local fallback pipeline for {model_name}... This may take a minute.")
            from transformers import pipeline
            try:
                self.hf_pipeline = pipeline("text-generation", model=model_name, device_map="auto")
                self.hf_pipeline._model_name = model_name
                logger.info("✅ [HUGGINGFACE] Model loaded successfully.")
            except Exception as e:
                logger.error(f"❌ [HUGGINGFACE] Failed to load HF pipeline for {model_name}: {e}")
                self.hf_pipeline = False 

    def generate_hf_fallback(self, messages, model_name):
        logger.info(f"🤖 [HUGGINGFACE] Attempting Fallback generation with model: {model_name}")
        start_time = time.time()
        self._load_hf_pipeline(model_name)
        if not self.hf_pipeline:
            return None, 0, 0
            
        try:
            response = self.hf_pipeline(
                messages, 
                max_new_tokens=2048, 
                do_sample=True, 
                temperature=0.7,
                top_p=0.9,
                pad_token_id=self.hf_pipeline.tokenizer.eos_token_id
            )
            out_messages = response[0]["generated_text"]
            content = out_messages[-1]["content"] if isinstance(out_messages, list) else out_messages
            # Rough token estimate
            approx_tokens = int(len(content) / 4)
            elapsed = time.time() - start_time
            return content, approx_tokens, elapsed
        except Exception as e:
            logger.error(f"❌ [HUGGINGFACE] Generation failed: {e}")
            return None, 0, 0

    def chat(self, user_query: str, history: list, session_id: str = None, 
             selected_model: str = None, custom_api_key: str = None) -> dict:
                 
        if not session_id:
            # Throwback to a generic response if no session exists internally
            logger.warning("No session ID passed to Chat Pipeline.")

        # 1. Greeting Check
        if self._is_greeting(user_query):
            logger.info("👋 [CHAT] Greeting detected. Short-circuiting.")
            response = "Hello! I am your intelligent document assistant. How can I help you today?"
            save_message(session_id, "user", user_query)
            save_message(session_id, "assistant", response)
            return {"response": response, "tokens": 0, "time": 0.0, "provider": "system"}

        # 2. Get Context
        context_chunks = self.get_context(user_query, session_id)
        context_str = "\n---\n".join([c["text"] for c in context_chunks])

        # 3. Formulate Prompt
        sys_prompt = "You are a helpful and intelligent assistant."
        if context_str:
            sys_prompt += f" Please use the following retrieved context from documents to answer the user's question:\n\n{context_str}"
        
        messages = [{"role": "system", "content": sys_prompt}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        
        messages.append({"role": "user", "content": user_query})

        save_message(session_id, "user", user_query)

        # Build list of models to try
        models_to_try = []
        if selected_model:
            models_to_try.append(selected_model)
        
        # Extend with fallbacks
        for m in self.or_models:
            if m not in models_to_try:
                models_to_try.append(m)
        for m in self.hf_models:
            if m not in models_to_try:
                models_to_try.append(m)

        for model in models_to_try:
            if "/" in model and ("openai" in model or "anthropic" in model or "meta" in model or "google" in model or "mistral" in model or model in self.or_models):
                # Try OpenRouter
                resp, tkns, t = self.generate_openrouter(messages, model, custom_api_key)
                if resp:
                    logger.info(f"✅ [OPENROUTER] Generation successful. Took {t:.2f}s")
                    provider_str = f"openrouter:{model}"
                    save_message(session_id, "assistant", resp, tkns, t, provider_str)
                    return {"response": resp, "tokens": tkns, "time": round(t, 2), "provider": provider_str, "context_chunks": context_chunks}
            else:
                # Try Hugging Face
                resp, tkns, t = self.generate_hf_fallback(messages, model)
                if resp:
                    logger.info(f"✅ [HUGGINGFACE] Generation successful. Took {t:.2f}s")
                    provider_str = f"local:{model}"
                    save_message(session_id, "assistant", resp, tkns, t, provider_str)
                    return {"response": resp, "tokens": tkns, "time": round(t, 2), "provider": provider_str, "context_chunks": context_chunks}

        fail_msg = "I apologize, but all my language generation backends have failed."
        save_message(session_id, "assistant", fail_msg, provider="error")
        return {"response": fail_msg, "tokens": 0, "time": 0.0, "provider": "error", "context_chunks": []}

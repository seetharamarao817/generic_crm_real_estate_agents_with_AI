# 🧠 Intelligent RAG Chatbot

An advanced, full-stack RAG (Retrieval-Augmented Generation) chatbot system powered by **Flask**, **ChromaDB**, and **SQLite**. It features a robust dual-layer AI strategy: it uses **OpenRouter** for global API access and automatically falls back to **local HuggingFace models** if the internet or API fails.

---

## 🌟 Key Features

### 📂 Dynamic Knowledge Base (RAG)
*   **Global Knowledge**: Upload documents (PDF/TXT) to a shared knowledge layer accessible by every chat.
*   **Local (Context) Uploads**: Inject sensitive or specific documents into a single chat session only.
*   **Automated Insights**: Rich metadata extraction from chunks (Keywords, File types) displayed within the UI.
*   **Visual Context**: A collapsible "View RAG Context" window below AI responses showing the exact snippets used for generation.

### 🎭 Multi-Model Intelligence
*   **Dual-Orchestration**: Seamless integration with **OpenRouter** (primary) and **HuggingFace Transformers** (local fallback).
*   **Custom Overrides**: Select specific models directly from the UI or provide your own **OpenRouter API Key** in the settings.
*   **Auto-Titling**: The first message of every session is analyzed by the AI to generate a relevant chat title.

### 📊 Advanced UI & UX
*   **Session Management**: Persistent chat history stored in SQLite; easily switch between old conversations.
*   **Real-time Metrics**: View generation speed (seconds), token counts, and the specific model provider for every message.
*   **Sidebar Controls**: Collapsible sidebar for history management and clean light-mode aesthetics.
*   **Markdown Support**: Full formatting including code blocks with syntax highlighting.

---

## 🚀 Getting Started

### 1. Prerequisites
*   Python 3.8 or higher.
*   Internet connection (for first-time model downloads and OpenRouter access).

### 2. Installation
Clone or navigate to the project directory and run:

```bash
# 1. Create a virtual environment
python3 -m venv venv

# 2. Activate it
# On Linux/macOS:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure your keys:

```bash
cp .env.example .env
```

**Required Variables**:
*   `OPENROUTER_API_KEY`: Your primary API key.
*   `OPENROUTER_MODELS`: Comma-separated list of premium models to attempt.
*   `HF_FALLBACK_MODELS`: Comma-separated list of local models to use if OpenRouter fails.

### 4. Running the App
Start the Flask backend:

```bash
export PYTHONPATH=$PYTHONPATH:.
python3 backend/app.py
```

Open your browser and navigate to: `http://localhost:5000`

---

## ⚙️ Advanced Usage

### Setting a Custom API Key
You can override the server's default key temporarily for your browser session:
1. Click the **Settings (⚙️)** in the top right.
2. Enter your `sk-or-v1-...` key.
3. Click **Save Changes**.
4. To remove, click the **Trash icon (🗑️)** next to the key field.

### Injecting Documents
1. Navigate to the top-right **Upload Data (📁)** menu.
2. Select your file (PDF or TXT).
3. Choose a scope:
    *   **Global**: Available to all chats.
    *   **This Chat Only**: Restricted to the current session.
4. Click **Select File** to start the "learning" process.

---

## 🏗️ System Architecture

*   **Frontend**: Vanilla JavaScript + HTML5.
*   **API Framework**: Flask.
*   **Vector Storage**: ChromaDB (locally persisted).
*   **Session Database**: SQLite (`chatbot.db`).
*   **AI Pipelines**: 
    *   `chat_pipeline.py`: Handles model selection, prompts, and context retrieval.
    *   `document_pipeline.py`: Handles file extraction, chunking, and keyword tagging.

---

> [!IMPORTANT]
> **First Run Note:** 
> The first time the system falls back to a local model (like Qwen2.5-0.5B), it will download approximately 1GB of model weights to your machine. This may take a minute depending on your connection—progress will be visible in the terminal logs.
